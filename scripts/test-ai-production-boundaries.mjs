import assert from 'node:assert/strict'

const {
  assertValidReasoningOutput,
  validateReasoningOutput,
  ReasoningOutputValidationError,
} = await import('../lib/ai/task-contract.ts')
const {
  evaluateRagGeneration,
  recordRagGenerationEvaluation,
  summarizeRagGenerationEvaluation,
} = await import('../lib/ai/rag-generation-evaluation.ts')

const validInvestigation = {
  executive_summary: 'Customer identifiers show an observed completeness issue.',
  probable_root_causes: [{ hypothesis: 'Source population changed', proven: false }],
  business_issue: 'Customer contact workflows can be incomplete.',
  business_impact: 'Downstream outreach may miss records.',
  risk: 'MEDIUM',
  recommendations: [{
    action: 'Validate the upstream population rule.',
    priority: 'HIGH',
    approval_required: true,
    rationale: 'The profile proves missing values, not the source-system cause.',
  }],
  confidence: 0.82,
  evidence_gaps: ['Upstream transformation evidence is not available.'],
}

const validOutput = assertValidReasoningOutput('profiling_investigation', validInvestigation)
assert.equal(validOutput.valid, true)
assert.equal(validOutput.contractId, 'datanexus.profiling-investigation.output')
assert.ok(validOutput.outputBytes > 0)

const missingEvidence = validateReasoningOutput('profiling_investigation', {
  ...validInvestigation,
  evidence_gaps: undefined,
})
assert.equal(missingEvidence.valid, false)
assert.ok(missingEvidence.issues.some((issue) => issue.path === '$.evidence_gaps'))

assert.throws(
  () => assertValidReasoningOutput('profiling_investigation', { ...validInvestigation, confidence: 4 }),
  ReasoningOutputValidationError,
)

const goodEnvelope = {
  answer: 'The approved retention period is seven years.',
  refused: false,
  claims: [{
    claimId: 'retention-period',
    text: 'The approved retention period is seven years.',
    factual: true,
    citationIds: ['policy-current'],
  }],
  citations: [{
    citationId: 'policy-current',
    projectId: 'project-a',
    objectKey: 'retention-policy-v3',
    authority: 'AUTHORITATIVE',
    effectiveFrom: '2026-01-01T00:00:00Z',
    effectiveTo: '2027-01-01T00:00:00Z',
  }],
}

const goodCase = {
  caseId: 'retention-001',
  asOf: '2026-09-10T00:00:00Z',
  expectedRefusal: false,
  minimumAuthority: 'APPROVED',
  requiredClaimIds: ['retention-period'],
  expectedSupportByClaim: { 'retention-period': ['policy-current'] },
}

const good = evaluateRagGeneration(goodEnvelope, goodCase)
assert.equal(good.passed, true)
assert.equal(good.citationPrecision, 1)
assert.equal(good.citationCompleteness, 1)
assert.equal(good.groundedClaimRate, 1)
assert.equal(good.authorityValidity, 1)
assert.equal(good.temporalValidity, 1)
assert.equal(good.refusalCorrectness, 1)

const stale = evaluateRagGeneration({
  ...goodEnvelope,
  citations: [{
    ...goodEnvelope.citations[0],
    effectiveTo: '2026-08-01T00:00:00Z',
  }],
}, goodCase)
assert.equal(stale.passed, false)
assert.equal(stale.temporalValidity, 0)
assert.deepEqual(stale.staleCitationIds, ['policy-current'])

const weakAuthority = evaluateRagGeneration({
  ...goodEnvelope,
  citations: [{ ...goodEnvelope.citations[0], authority: 'REFERENCE' }],
}, goodCase)
assert.equal(weakAuthority.passed, false)
assert.equal(weakAuthority.authorityValidity, 0)

const missingCitation = evaluateRagGeneration({
  ...goodEnvelope,
  claims: [{ ...goodEnvelope.claims[0], citationIds: [] }],
}, goodCase)
assert.equal(missingCitation.passed, false)
assert.equal(missingCitation.citationCompleteness, 0)
assert.equal(missingCitation.groundedClaimRate, 0)

const refusal = evaluateRagGeneration({
  answer: 'The available authority is insufficient to answer.',
  refused: true,
  refusalReason: 'NO_AUTHORITATIVE_EVIDENCE',
  claims: [],
  citations: [],
}, {
  caseId: 'refusal-001',
  asOf: '2026-09-10T00:00:00Z',
  expectedRefusal: true,
})
assert.equal(refusal.passed, true)
assert.equal(refusal.refusalCorrectness, 1)

const summary = summarizeRagGenerationEvaluation([good, stale, weakAuthority, missingCitation, refusal])
assert.equal(summary.caseCount, 5)
assert.ok(summary.passRate > 0 && summary.passRate < 1)

const recorded = []
const fakeEngine = {
  id: 'fake-evaluation-engine',
  async record(input) {
    recorded.push(input)
    return { resultId: `result-${recorded.length}`, persisted: true }
  },
  async scorecard() { return [] },
}
const persistence = await recordRagGenerationEvaluation({
  engine: fakeEngine,
  projectId: 'project-a',
  providerId: 'openai_compatible',
  modelName: 'model-a',
  results: [good, refusal],
  evidenceRefs: ['benchmark:rag-generation:v1'],
  benchmarkSuiteVersion: '1',
})
assert.equal(persistence.receipts.length, 7)
assert.equal(recorded.length, 7)
assert.ok(recorded.every((entry) => entry.evaluationType === 'RAG_GENERATION_GROUNDING'))
assert.ok(recorded.some((entry) => entry.metricName === 'CITATION_COMPLETENESS'))
assert.ok(recorded.some((entry) => entry.metricName === 'TEMPORAL_VALIDITY'))
assert.ok(recorded.every((entry) => !('rawOutput' in (entry.metadata ?? {}))))

console.log('AI output validation and RAG generation evaluation behavior verified.')
