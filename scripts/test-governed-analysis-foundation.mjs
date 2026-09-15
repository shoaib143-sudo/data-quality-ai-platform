import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  ANALYSIS_CONTRACT_VERSION,
  assessLearningCase,
  analyzeHistoricalOutcomes,
  buildAnalysisEvidenceEnvelope,
  canonicalOutcomeFromObservedEvidence,
  deduplicateHistoricalCases,
} from '../lib/data-quality/governed-analysis-foundation.ts'

const migration = fs.readFileSync(path.join(process.cwd(), 'supabase/migrations/20260915102000_governed_analytics_foundation.sql'), 'utf8')

for (const required of [
  'governance.learning_case_assessments',
  'evidence_cutoff_at timestamptz not null',
  'learning_eligible boolean not null default false',
  "adjudication_state in ('UNADJUDICATED', 'PENDING', 'ADJUDICATED')",
  'governance.metric_definition_versions',
  'references profiling.metric_definitions(id) on delete restrict',
  'governance.analysis_evidence_envelopes',
  'window_end <= evidence_cutoff_at',
  'data_freshness_at is null or data_freshness_at <= evidence_cutoff_at',
  'enable row level security',
]) {
  assert.ok(migration.includes(required), `Migration contract is missing: ${required}`)
}

const cutoff = '2026-09-01T00:00:00.000Z'
const base = {
  id: 'case-1',
  projectId: 'project-a',
  caseKey: 'incident-1',
  persisted: true,
  sourceKind: 'INCIDENT',
  outcomeClass: 'SUCCESS',
  adjudicationState: 'ADJUDICATED',
  observedAt: '2026-08-20T00:00:00.000Z',
  evidenceAvailableAt: '2026-08-21T00:00:00.000Z',
  outcomeConfidence: 0.9,
  provenanceCompleteness: 1,
  sourceReliability: 1,
  temporalCompleteness: 1,
  domainRelevance: 0.8,
  recurrenceObservationCompleteness: 0.5,
  hasExecutionEvidence: true,
  hasDownstreamImpactEvidence: false,
}

assert.equal(assessLearningCase(base, cutoff).learningEligible, true)
assert.equal(assessLearningCase({ ...base, sourceKind: 'SYNTHETIC_DEMO' }, cutoff).exclusionReason, 'SYNTHETIC_OR_TEST_CASE')
assert.equal(assessLearningCase({ ...base, persisted: false }, cutoff).exclusionReason, 'NON_PERSISTED_CASE')
assert.equal(assessLearningCase({ ...base, adjudicationState: 'PENDING' }, cutoff).exclusionReason, 'OUTCOME_NOT_ADJUDICATED')
assert.equal(assessLearningCase({ ...base, evidenceAvailableAt: '2026-09-02T00:00:00.000Z' }, cutoff).exclusionReason, 'EVIDENCE_AFTER_CUTOFF')

assert.equal(
  canonicalOutcomeFromObservedEvidence({
    executionSucceeded: true,
    verifiedOutcomeClass: null,
    adjudicationState: 'ADJUDICATED',
    observedAt: '2026-08-20T00:00:00.000Z',
    evidenceAvailableAt: '2026-08-21T00:00:00.000Z',
  }),
  null,
  'Successful execution alone must not be treated as a successful remediation or business outcome.',
)
assert.equal(
  canonicalOutcomeFromObservedEvidence({
    executionSucceeded: false,
    verifiedOutcomeClass: 'SUCCESS',
    adjudicationState: 'ADJUDICATED',
    observedAt: '2026-08-20T00:00:00.000Z',
    evidenceAvailableAt: '2026-08-21T00:00:00.000Z',
  }),
  'SUCCESS',
  'Canonical outcome follows verified observed evidence rather than raw execution status.',
)

const duplicateOlder = { ...base, id: 'case-old', evidenceAvailableAt: '2026-08-19T00:00:00.000Z' }
assert.equal(deduplicateHistoricalCases([duplicateOlder, base]).length, 1, 'Duplicate case identity must not inflate the learning population.')
assert.equal(deduplicateHistoricalCases([duplicateOlder, base])[0].id, 'case-1', 'Latest eligible representation should win within one canonical case identity.')

const sparse = analyzeHistoricalOutcomes({ projectId: 'project-a', cases: [base], evidenceCutoffAt: cutoff })
assert.equal(sparse.status, 'INSUFFICIENT_EVIDENCE')
assert.equal(sparse.sampleSize, 1)

const enoughCases = Array.from({ length: 5 }, (_, index) => ({ ...base, id: `case-${index + 1}`, caseKey: `incident-${index + 1}` }))
const analysis = analyzeHistoricalOutcomes({ projectId: 'project-a', cases: enoughCases, evidenceCutoffAt: cutoff })
assert.equal(analysis.status, 'OK')
assert.equal(analysis.sampleSize, 5)
assert.equal(analysis.outcomeCounts.SUCCESS, 5)

const envelopeInput = {
  projectId: 'project-a',
  analysisType: 'OUTCOME_TREND',
  metricKey: 'remediation_success_rate',
  metricVersion: 'v1',
  calculationMethod: 'Count adjudicated SUCCESS outcomes divided by eligible canonical cases.',
  filters: { domain: 'Customer' },
  windowStart: '2026-08-01T00:00:00.000Z',
  windowEnd: '2026-08-31T23:59:59.000Z',
  evidenceCutoffAt: cutoff,
  sourceRecordIds: enoughCases.map((item) => item.id),
  sampleSize: 5,
  dataFreshnessAt: '2026-08-31T20:00:00.000Z',
  confidence: 0.8,
  uncertainty: { method: 'sample-size-aware' },
  evidenceLineage: { source: 'agent.agent_learning_cases' },
  reproducibilityRef: 'governed-analysis:test:v1',
  algorithmVersion: 'count-v1',
}
const envelope = buildAnalysisEvidenceEnvelope(envelopeInput)
assert.equal(envelope.contractVersion, ANALYSIS_CONTRACT_VERSION)

assert.throws(
  () => buildAnalysisEvidenceEnvelope({ ...envelopeInput, windowEnd: '2026-09-02T00:00:00.000Z' }),
  /evidence cutoff/,
  'Future evidence must not cross the historical cutoff.',
)

assert.ok(!('predictionProbability' in envelope), 'Stage 1 and Stage 2 must not expose predictive probability.')

console.log('Governed analytics foundation verification passed.')
