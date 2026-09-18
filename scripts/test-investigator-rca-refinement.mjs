import assert from 'node:assert/strict'

const { refineInvestigatorRca } = await import('../lib/agents/investigator-rca-refinement.ts')

const result = await refineInvestigatorRca({
  datasets: [],
  recommendations: [],
  unresolved: [],
  hypotheses: [
    {
      datasetId: 'dataset-a',
      hypothesisKey: 'FRESHNESS',
      hypothesis: 'Freshness breach',
      evidence: ['incident-a', 'freshness-a'],
      evidenceFamilies: ['incident', 'freshness_alert'],
      evidenceStrength: 'HIGH',
      confidence: null,
      confidenceBasis: 'No calibrated probability is asserted.',
      discriminatingEvidenceNeeded: ['Compare timestamps'],
    },
    {
      datasetId: 'dataset-a',
      hypothesisKey: 'PROFILE_EXECUTION',
      hypothesis: 'Partial profile',
      evidence: ['run-a'],
      evidenceFamilies: ['profile_execution'],
      evidenceStrength: 'MEDIUM',
      confidence: null,
      confidenceBasis: 'No calibrated probability is asserted.',
      discriminatingEvidenceNeeded: ['Compare complete profile'],
    },
    {
      datasetId: 'dataset-b',
      hypothesisKey: 'PROFILE_DRIFT',
      hypothesis: 'Metric drift',
      evidence: ['anomaly-b'],
      evidenceFamilies: ['profile_anomaly'],
      evidenceStrength: 'LOW',
      confidence: null,
      confidenceBasis: 'No calibrated probability is asserted.',
      discriminatingEvidenceNeeded: ['Compare baseline'],
    },
  ],
})

assert.equal(result.stopReason, 'CONFIDENCE_REACHED')
assert.equal(result.confidence, 1)
assert.equal(result.iterations, 3)
assert.equal(result.toolCallsUsed, 0)
assert.equal(result.handoffsUsed, 0)
assert.equal(result.output.coverage.complete, true)
assert.equal(result.output.coverage.tested, 3)
assert.equal(result.output.coverage.total, 3)
assert.deepEqual(result.output.untestedCandidateKeys, [])
assert.equal(result.output.probableCauses.length, 1)
assert.equal(result.output.probableCauses[0].hypothesisKey, 'FRESHNESS')
assert.equal(result.output.evidenceLimitations.length, 1)
assert.equal(result.output.evidenceLimitations[0].hypothesisKey, 'PROFILE_EXECUTION')
assert.equal(result.output.alternativeCauses.length, 1)
assert.equal(result.output.alternativeCauses[0].hypothesisKey, 'PROFILE_DRIFT')
assert.ok(result.output.assessments.every((assessment) => !assessment.rationale.includes('probability') || assessment.rationale.includes('not a calibrated causal probability')))

const budgetLimited = await refineInvestigatorRca({
  datasets: [],
  recommendations: [],
  unresolved: [],
  hypotheses: Array.from({ length: 10 }, (_, index) => ({
    datasetId: `dataset-${index}`,
    hypothesisKey: 'QUALITY_CONTROL',
    hypothesis: `Quality control ${index}`,
    evidence: [`rule-${index}`],
    evidenceFamilies: ['quality_rule_failure'],
    evidenceStrength: 'MEDIUM',
    confidence: null,
    confidenceBasis: 'No calibrated probability is asserted.',
    discriminatingEvidenceNeeded: ['Compare previous passing run'],
  })),
})

assert.equal(budgetLimited.stopReason, 'ITERATION_BUDGET_EXHAUSTED')
assert.equal(budgetLimited.iterations, 8)
assert.equal(budgetLimited.output.coverage.complete, false)
assert.equal(budgetLimited.output.coverage.tested, 8)
assert.equal(budgetLimited.output.untestedCandidateKeys.length, 2)
assert.equal(budgetLimited.toolCallsUsed, 0)
assert.equal(budgetLimited.handoffsUsed, 0)

console.log('Investigator RCA refinement tests competing hypotheses within the canonical eight-iteration budget and reports partial coverage when bounded execution is exhausted.')
