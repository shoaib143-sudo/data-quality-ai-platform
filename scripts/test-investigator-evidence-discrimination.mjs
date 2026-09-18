import assert from 'node:assert/strict'

const { buildInvestigatorEvidenceAnalysis } = await import('../lib/agents/investigator-evidence-discrimination.ts')

const analysis = buildInvestigatorEvidenceAnalysis({
  datasets: [
    { id: 'dataset-a', name: 'Customers' },
    { id: 'dataset-b', name: 'Orders' },
    { id: 'dataset-c', name: 'Payments' },
  ],
  versions: [
    { id: 'version-a', dataset_id: 'dataset-a' },
    { id: 'version-b', dataset_id: 'dataset-b' },
    { id: 'version-c', dataset_id: 'dataset-c' },
  ],
  profileRuns: [
    { id: 'run-a', dataset_version_id: 'version-a', status: 'COMPLETED' },
    { id: 'run-b', dataset_version_id: 'version-b', status: 'PARTIAL' },
    { id: 'run-c', dataset_version_id: 'version-c', status: 'COMPLETED' },
  ],
  incidents: [
    { id: 'incident-a', dataset_id: 'dataset-a', status: 'OPEN' },
    { id: 'incident-c', dataset_id: 'dataset-c', status: 'OPEN' },
  ],
  issues: [
    { id: 'issue-a', dataset_id: 'dataset-a', status: 'OPEN' },
    { id: 'issue-b', dataset_id: 'dataset-b', status: 'CLOSED' },
  ],
  remediationKnowledge: [
    { id: 'remediation-a', dataset_id: 'dataset-a', outcome_status: 'WORKED', reusable_guidance: 'Restore the delayed upstream feed.', confidence: 0.9 },
    { id: 'remediation-b', dataset_id: 'dataset-b', outcome_status: 'FAILED', remediation_action: 'Retry the source.' },
  ],
  alerts: [
    { id: 'freshness-a', dataset_id: 'dataset-a', profile_run_id: 'run-a', category: 'FRESHNESS', status: 'OPEN' },
    { id: 'freshness-b', dataset_id: 'dataset-b', profile_run_id: 'run-b', category: 'FRESHNESS', status: 'OPEN' },
    { id: 'closed-freshness-a', dataset_id: 'dataset-a', category: 'FRESHNESS', status: 'RESOLVED' },
  ],
  ruleRuns: [
    { id: 'rule-a', profile_run_id: 'run-a', status: 'FAILED' },
    { id: 'rule-b', profile_run_id: 'run-b', status: 'FAILED' },
    { id: 'rule-c-pass', profile_run_id: 'run-c', status: 'PASSED' },
  ],
  anomalies: [
    { id: 'anomaly-a', profile_run_id: 'run-a' },
    { id: 'anomaly-b', profile_run_id: 'run-b' },
  ],
  lineageAssets: [
    { id: 'asset-a', dataset_id: 'dataset-a' },
    { id: 'asset-b', dataset_id: 'dataset-b' },
  ],
  lineageColumnMappings: [
    { id: 'mapping-ab', source_asset_id: 'asset-a', target_asset_id: 'asset-b' },
  ],
})

const datasetA = analysis.datasets.find((row) => row.datasetId === 'dataset-a')
const datasetB = analysis.datasets.find((row) => row.datasetId === 'dataset-b')
const datasetC = analysis.datasets.find((row) => row.datasetId === 'dataset-c')
assert.ok(datasetA)
assert.ok(datasetB)
assert.ok(datasetC)

assert.deepEqual(datasetA.incidentIds, ['incident-a'])
assert.deepEqual(datasetA.freshnessAlertIds, ['freshness-a'])
assert.deepEqual(datasetA.failedRuleIds, ['rule-a'])
assert.deepEqual(datasetA.anomalyIds, ['anomaly-a'])
assert.deepEqual(datasetA.failedOrPartialProfileRunIds, [])
assert.deepEqual(datasetA.workedRemediationIds, ['remediation-a'])
assert.deepEqual(datasetA.lineageMappingIds, ['mapping-ab'])

assert.deepEqual(datasetB.incidentIds, [])
assert.deepEqual(datasetB.freshnessAlertIds, ['freshness-b'])
assert.deepEqual(datasetB.failedRuleIds, ['rule-b'])
assert.deepEqual(datasetB.anomalyIds, ['anomaly-b'])
assert.deepEqual(datasetB.failedOrPartialProfileRunIds, ['run-b'])
assert.deepEqual(datasetB.failedRemediationIds, ['remediation-b'])
assert.deepEqual(datasetB.lineageMappingIds, ['mapping-ab'])

const aHypotheses = analysis.hypotheses.filter((row) => row.datasetId === 'dataset-a')
const bHypotheses = analysis.hypotheses.filter((row) => row.datasetId === 'dataset-b')
const cHypotheses = analysis.hypotheses.filter((row) => row.datasetId === 'dataset-c')

assert.ok(aHypotheses.some((row) => row.hypothesisKey === 'FRESHNESS'))
assert.ok(aHypotheses.some((row) => row.hypothesisKey === 'QUALITY_CONTROL'))
assert.ok(aHypotheses.some((row) => row.hypothesisKey === 'PROFILE_DRIFT'))
assert.ok(aHypotheses.some((row) => row.hypothesisKey === 'LINEAGE_CONTRIBUTION'))
assert.ok(aHypotheses.every((row) => row.evidenceStrength === 'HIGH'))
assert.ok(aHypotheses.every((row) => row.confidence === null))
assert.ok(aHypotheses.every((row) => row.confidenceBasis.includes('No calibrated probability is asserted')))
assert.ok(aHypotheses.every((row) => row.discriminatingEvidenceNeeded.length > 0))

assert.ok(bHypotheses.some((row) => row.hypothesisKey === 'PROFILE_EXECUTION'))
assert.ok(bHypotheses.every((row) => !row.evidence.includes('incident-a')))
assert.ok(bHypotheses.every((row) => !row.evidence.includes('rule-a')))
assert.ok(aHypotheses.every((row) => !row.evidence.includes('rule-b')))
assert.deepEqual(cHypotheses, [])

assert.deepEqual(analysis.recommendations, [{
  datasetId: 'dataset-a',
  priority: 'MEDIUM',
  action: 'Restore the delayed upstream feed.',
  evidence: ['remediation-a'],
  priorOutcome: 'WORKED',
  confidence: 0.9,
}])

assert.deepEqual(analysis.unresolved, [{
  datasetId: 'dataset-c',
  reason: 'An open incident is present but no same-dataset freshness, failed-rule, anomaly, or incomplete-profile signal is available in the bounded evidence window.',
  evidence: ['incident-c'],
}])

for (const hypothesis of analysis.hypotheses) {
  assert.ok(hypothesis.datasetId)
  assert.ok(hypothesis.evidence.length > 0)
  assert.ok(hypothesis.evidenceFamilies.length > 0)
}

console.log('Investigator hypotheses remain dataset-scoped, expose discriminating evidence needs, avoid uncalibrated probability claims, and preserve unresolved incidents.')
