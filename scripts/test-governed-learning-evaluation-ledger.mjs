import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'

const { recordIndependentPairedEvaluations } = await import('../lib/agents/governed-learning-evaluation-ledger.ts')
const source = `case-${Date.now()}`
const caseKey = createHash('sha256').update(source).digest('hex')
const base = {
  projectId: 'project', candidateId: 'candidate', agentKey: 'profiling_agent', skillKey: 'profile_evidence_analysis',
  evaluatorId: 'independent-evaluator', evaluatorType: 'DETERMINISTIC', benchmarkKey: 'benchmark-1',
  datasetKey: 'dataset-1', observedAt: '2026-09-29T00:00:00Z', baselineVersion: '1.0', candidateVersion: '1.1',
  cases: [{ caseKey, baselineScore: 0.7, candidateScore: 0.8, baselineEvidenceRef: 'baseline', candidateEvidenceRef: 'candidate', authorityViolation: false, adversarialFailure: false }],
}
await assert.rejects(() => recordIndependentPairedEvaluations({ ...base, evaluatorId: 'profiling_agent' }), /independent/)
await assert.rejects(() => recordIndependentPairedEvaluations({ ...base, cases: [{ ...base.cases[0], caseKey: 'plain' }] }), /SHA-256/)
await assert.rejects(() => recordIndependentPairedEvaluations({ ...base, cases: [{ ...base.cases[0], candidateScore: 2 }] }), /between 0 and 1/)
console.log('Independent paired evaluation ledger rejects self-evaluation, unhashed cases, and invalid scores before persistence.')
