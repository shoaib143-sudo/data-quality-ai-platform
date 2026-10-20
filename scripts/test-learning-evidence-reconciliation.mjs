import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const { reconcileLearningEvidence } = await import('../lib/agents/learning-evidence-reconciliation.ts')
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const hash = value => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`
const policy = {
  policyId: 'policy-key', projectId: uuid(1), candidateId: uuid(2),
  agentKey: 'profiling_agent', skillKey: 'profile_evidence_analysis', mode: 'GUIDED',
  datasetVersionIds: ['dataset-v1'], datasetManifestId: uuid(3), baselineVersion: 'v1', candidateVersion: 'v2',
  rollbackRef: 'version:v1', evaluatorActorId: uuid(5), proposerActorId: uuid(6), rubricRef: 'rubric:v1',
  calibrationRef: 'calibration:v1', manifestHash: hash('dataset manifest'), lockedAt: '2026-10-01T00:00:00.000Z',
  primaryMetric: 'verified_task_quality', analysisPlanRef: 'analysis:v1', sampleSize: 2, minimumGain: 0.05,
  minimumScore: 0.8, budget: { totalCost: 0, perRunCost: 0, totalTokens: 0, perRunTokens: 0, latencyMs: 100 },
}
const executionManifestHash = hash('sealed execution manifest')
const cases = [0, 1].map(n => ({
  caseKey: String(n + 1).padStart(64, '0'), datasetVersionId: 'dataset-v1', inputHash: hash(`input-${n}`),
  baselineArtifactHash: hash('baseline artifact'), candidateArtifactHash: hash('candidate artifact'),
}))
const dispatches = [], scores = [], settlements = [], costEvents = []
let next = 10
for (const [index, item] of cases.entries()) for (const arm of ['baseline', 'candidate']) {
  const claimId = uuid(next++), invocationId = uuid(next++), reservationId = uuid(next++), settlementId = uuid(next++), costEventId = uuid(next++)
  const outputBytes = `exact-output-${index}-${arm}`
  const outputHash = hash(outputBytes)
  const artifactHash = arm === 'baseline' ? item.baselineArtifactHash : item.candidateArtifactHash
  dispatches.push({ claimId, projectId: policy.projectId, policyRecordId: uuid(4), candidateId: policy.candidateId,
    runId: uuid(7), executionManifestHash, caseKey: item.caseKey, datasetVersionId: item.datasetVersionId,
    arm, attempt: 1, artifactHash, inputHash: item.inputHash, status: 'completed', invocationId,
    outputRef: `private-output:${claimId}`, outputHash, outputBytes, reservationId, settlementId, costEventId,
    tokens: 0, costUsd: '0', latencyMs: 5 })
  scores.push({ scoreId: uuid(next++), claimId, projectId: policy.projectId, policyRecordId: uuid(4), candidateId: policy.candidateId,
    runId: uuid(7), evaluatorActorId: policy.evaluatorActorId, assignmentId: uuid(8), acknowledgementId: uuid(9),
    rubricRef: policy.rubricRef, calibrationRef: policy.calibrationRef, outputHash,
    score: arm === 'baseline' ? 0.7 : 0.9, authorityViolation: false, safetyFailure: false, observedAt: '2026-10-10T00:00:00.000Z' })
  settlements.push({ id: settlementId, reservationId, projectId: policy.projectId, policyRecordId: uuid(4), candidateId: policy.candidateId,
    runId: uuid(7), invocationId, costEventId, status: 'ACCOUNTED', tokens: 0, costUsd: '0' })
  costEvents.push({ id: costEventId, projectId: policy.projectId, runId: uuid(7), invocationId, accountingStatus: 'PRICED', currency: 'USD', tokens: 0, costUsd: '0' })
}
const base = { policy, policyRecordId: uuid(4), runId: uuid(7), executionManifestHash, sealedCases: cases,
  dispatches, scores, settlements, costEvents, finalizedAt: '2026-10-20T08:00:00.000Z' }

const reconciliation = reconcileLearningEvidence(base)
assert.equal(reconciliation.structurallyComplete, true)
assert.equal(reconciliation.expectedPairs, 2)
assert.equal(reconciliation.scoredPairs, 2)
assert.equal(reconciliation.baselineMeanScore, 0.7)
assert.equal(reconciliation.candidateMeanScore, 0.9)
assert.equal(reconciliation.totalCostUsd, '0')
assert.match(reconciliation.evidenceDigest, /^sha256:[a-f0-9]{64}$/)
assert.equal(reconcileLearningEvidence({ ...base, dispatches: [...dispatches].reverse(), scores: [...scores].reverse() }).evidenceDigest, reconciliation.evidenceDigest)
const priced = structuredClone(base)
priced.policy.budget.totalCost = 0.4
priced.policy.budget.perRunCost = 0.1
priced.dispatches.forEach(item => { item.costUsd = '0.1' })
priced.settlements.forEach(item => { item.costUsd = '0.10' })
priced.costEvents.forEach(item => { item.costUsd = '0.100' })
assert.equal(reconcileLearningEvidence(priced).totalCostUsd, '0.4')

const broken = (mutate, pattern) => {
  const copy = structuredClone(base)
  mutate(copy)
  assert.throws(() => reconcileLearningEvidence(copy), pattern)
}
broken(x => { x.dispatches.pop() }, /EXPECTED_PAIR_COVERAGE_MISMATCH|SCORE_COVERAGE_MISMATCH/)
broken(x => { x.dispatches[0].outputBytes = 'tampered' }, /OUTPUT_BYTES_MISMATCH/)
broken(x => { x.dispatches[0].status = 'failed' }, /DISPATCH_NOT_COMPLETE_OR_UNSEALED/)
broken(x => { x.dispatches[0].artifactHash = hash('forged artifact') }, /DISPATCH_ARM_OR_ARTIFACT_MISMATCH/)
broken(x => { x.scores[0].outputHash = hash('different output') }, /SCORE_SCOPE_OR_AUTHENTICITY_MISMATCH/)
broken(x => { x.scores[0].evaluatorActorId = policy.proposerActorId }, /SCORE_SCOPE_OR_AUTHENTICITY_MISMATCH/)
broken(x => { x.scores[0].score = 1.1 }, /SCORE_SCOPE_OR_AUTHENTICITY_MISMATCH/)
broken(x => { x.costEvents[0].accountingStatus = 'UNPRICED' }, /COST_EVENT_UNPRICED_OR_MISMATCHED/)
broken(x => { x.settlements[0].costUsd = '0.01'; x.costEvents[0].costUsd = '0.01'; x.dispatches[0].costUsd = '0.01' }, /BUDGET_EXCEEDED/)
broken(x => { x.dispatches[0].inputHash = hash('different input') }, /DISPATCH_NOT_COMPLETE_OR_UNSEALED/)
broken(x => { x.scores.push(structuredClone(x.scores[0])) }, /SCORE_DUPLICATE_OR_INVALID/)
broken(x => { x.costEvents[0].currency = 'EUR' }, /COST_EVENT_UNPRICED_OR_MISMATCHED/)

console.log('PASS evidence reconciler enforces exact pair coverage, byte hashes, evaluator scope, canonical accounting, zero budget and stable digest; it does not produce an attestation or learning decision')
