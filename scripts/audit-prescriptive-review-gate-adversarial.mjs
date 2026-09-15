import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('lib/ai/prescriptive-review-gate.ts', 'utf8')
const tests = fs.readFileSync('scripts/test-prescriptive-review-gate.mjs', 'utf8')

for (const required of [
  "PRESCRIPTIVE_REVIEW_GATE_VERSION = 'prescriptive-review-gate-v1'",
  "status: 'REVIEW_REQUIRED' | 'NOT_READY'",
  "'PREDICTIVE_NOT_ELIGIBLE'",
  "'NO_CANDIDATES'",
  "'READY_FOR_HUMAN_REVIEW'",
  'candidateRankingApplied: false',
  'expectedImpactClaimed: false',
  'causalEffectClaimed: false',
  'recommendationAuthority: false',
  'decisionAuthority: false',
  'executionAuthority: false',
  'promotionAuthority: false',
  'automaticActionAllowed: false',
  'currentAuthorizationRequiredAtExecution: true',
  'humanDecisionRequired: true',
  "input.predictive.status !== 'ELIGIBLE_FOR_REVIEW'",
  'candidates: []',
  'candidate.requiresApproval !== true',
  'duplicate prescriptive candidateId',
]) {
  assert.ok(source.includes(required), `Prescriptive review boundary missing: ${required}`)
}

for (const forbidden of [
  'executeAction',
  'dispatchAction',
  'authorize(',
  'predictedEffectiveProbability',
  'expectedImpactScore',
  'causalEffect',
  'Math.random',
]) {
  assert.ok(!source.includes(forbidden), `Prescriptive review gate must not contain authority/prediction primitive: ${forbidden}`)
}

for (const required of [
  'predictive NOT_READY suppresses prescriptive candidates',
  'cross-project predictive evidence is rejected',
  'authoritative predictive evidence is rejected',
  'candidate without approval or evidence is rejected',
  'duplicate candidate ids are rejected',
  'candidate ordering is deterministic and not a ranking claim',
]) {
  assert.ok(tests.includes(required), `Prescriptive adversarial test missing: ${required}`)
}

console.log('Prescriptive review gate adversarial audit passed.')
