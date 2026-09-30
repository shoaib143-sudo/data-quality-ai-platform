import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
const { validateLearningEvaluationPolicy, classifyLearningEvaluation } = await import('../lib/agents/learning-evaluation-policy.ts')

const policy = {
  policyId: 'policy-1', projectId: 'project-1', candidateId: 'candidate-1',
  agentKey: 'profiling_agent', skillKey: 'profile_evidence_analysis', mode: 'GUIDED',
  datasetVersionIds: ['dataset-v1'], baselineVersion: '1', candidateVersion: '2',
  rollbackRef: 'version:1', evaluatorActorId: 'reviewer', proposerActorId: 'proposer',
  rubricRef: 'rubric:1', calibrationRef: 'calibration:1', manifestHash: `sha256:${'a'.repeat(64)}`,
  lockedAt: '2026-09-30T00:00:00Z', primaryMetric: 'verified_task_quality',
  analysisPlanRef: 'analysis:1', sampleSize: 100, minimumGain: 0.05, minimumScore: 0.8,
  budget: { totalCost: 0, perRunCost: 0, totalTokens: 0, perRunTokens: 0, latencyMs: 1000 },
}
const result = {
  policyId: 'policy-1', projectId: 'project-1', candidateId: 'candidate-1',
  baselineVersion: '1', candidateVersion: '2', mode: 'GUIDED', manifestHash: policy.manifestHash,
  evaluatorActorId: 'reviewer', observedAt: '2026-09-30T01:00:00Z', sampleCount: 100,
  baselineScore: 0.7, candidateScore: 0.9, gainLowerConfidenceBound: 0.1,
  independentlyVerified: true, evidenceComplete: true, confirmationWindowPassed: true,
  authorityViolations: 0, safetyFailures: 0, accountingComplete: true,
  totalCost: 0, maxRunCost: 0, totalTokens: 0, maxRunTokens: 0, maxLatencyMs: 100,
}
validateLearningEvaluationPolicy(policy)
for (const key of Object.keys(policy)) {
  const missing = structuredClone(policy); delete missing[key]
  assert.throws(() => validateLearningEvaluationPolicy(missing), key)
}
for (const patch of [
  { minimumGain: 0 }, { minimumGain: NaN }, { sampleSize: 1.5 },
  { datasetVersionIds: ['v1', 'v1'] }, { evaluatorActorId: 'proposer' },
  { candidateVersion: '1' }, { mode: 'OFF' }, { manifestHash: 'invented' },
  { agentKey: 'native_supervisor_agent' }, { skillKey: 'invented' },
  { agentKey: 'executive_agent', skillKey: 'profile_evidence_analysis' },
  { budget: { ...policy.budget, perRunCost: 1 } },
]) assert.throws(() => validateLearningEvaluationPolicy({ ...policy, ...patch }))
const classify = patch => classifyLearningEvaluation(policy, { ...result, ...patch })
assert.equal(classify({}).quality, 'IMPROVED')
assert.equal(classify({}).automaticPromotionAllowed, false)
assert.equal(classify({ candidateScore: 0.7, gainLowerConfidenceBound: 0 }).quality, 'INCONCLUSIVE')
assert.equal(classify({ candidateScore: 0.6 }).quality, 'REGRESSED')
assert.equal(classify({ sampleCount: 99 }).quality, 'INCONCLUSIVE')
assert.equal(classify({ independentlyVerified: false }).quality, 'INCONCLUSIVE')
assert.equal(classify({ evidenceComplete: false }).quality, 'INCONCLUSIVE')
assert.equal(classify({ confirmationWindowPassed: false }).quality, 'INCONCLUSIVE')
assert.equal(classify({ gainLowerConfidenceBound: null }).quality, 'INCONCLUSIVE')
assert.equal(classify({ candidateScore: null }).quality, 'INCONCLUSIVE')
assert.equal(classify({ accountingComplete: false }).disposition, 'STOPPED')
assert.equal(classify({ totalCost: 0.01 }).disposition, 'STOPPED')
assert.equal(classify({ totalTokens: 1 }).disposition, 'STOPPED')
assert.equal(classify({ maxLatencyMs: 1001 }).disposition, 'STOPPED')
assert.equal(classify({ observedAt: '2026-09-29T00:00:00Z' }).disposition, 'STOPPED')
for (const key of ['policyId', 'projectId', 'candidateId', 'baselineVersion', 'candidateVersion', 'mode', 'manifestHash', 'evaluatorActorId']) assert.equal(classify({ [key]: 'mismatch' }).disposition, 'STOPPED', key)
assert.equal(classify({ authorityViolations: 1, candidateScore: null, accountingComplete: false }).disposition, 'REJECTED')
assert.equal(classify({ safetyFailures: 1, policyId: 'wrong' }).disposition, 'REJECTED')
assert.throws(() => classify({ sampleCount: -1 }))
assert.throws(() => classify({ authorityViolations: NaN }))
assert.throws(() => classify({ candidateScore: 1.1 }))
assert.throws(() => classify({ gainLowerConfidenceBound: 0.5 }))
console.log('Evaluation policy validates required bindings and distinguishes positive gain, regression, missing evidence, budget stops and safety rejection. Synthetic fixtures are not live evidence.')
