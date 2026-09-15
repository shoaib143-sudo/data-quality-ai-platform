import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('lib/ai/prescriptive-review-gate.ts', 'utf8')
const tests = fs.readFileSync('scripts/test-prescriptive-review-gate.mjs', 'utf8')

for (const required of [
  "PRESCRIPTIVE_REVIEW_GATE_VERSION = 'prescriptive-review-gate-v2'",
  "status: 'REVIEW_REQUIRED' | 'NOT_READY'",
  "'PREDICTIVE_NOT_ELIGIBLE'",
  "'PRESCRIPTIVE_READINESS_NOT_ELIGIBLE'",
  "'NO_CANDIDATES'",
  "'READY_FOR_HUMAN_REVIEW'",
  "input.readiness.status !== 'ELIGIBLE_FOR_HUMAN_REVIEW'",
  'input.readiness.projectId !== projectId',
  'input.readiness.candidateModelVersionId !== candidateModelVersionId',
  'Prescriptive readiness evidenceRefs must contain provenance references',
  'prescriptivePolicyId',
  'prescriptivePolicyVersion',
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
  'causalEffect:',
  'Math.random',
]) {
  assert.ok(!source.includes(forbidden), `Prescriptive review gate must not contain authority/prediction primitive: ${forbidden}`)
}

for (const required of [
  'predictive NOT_READY suppresses prescriptive candidates',
  'prescriptive readiness NOT_READY suppresses candidates even when predictive evidence is eligible',
  'cross-project predictive or readiness evidence is rejected',
  'candidate model mismatch between predictive and readiness evidence is rejected',
  'authoritative predictive or readiness evidence is rejected',
  'missing predictive or readiness provenance is rejected',
  'candidate without approval or evidence is rejected',
  'duplicate candidate ids are rejected',
  'candidate ordering is deterministic and not a ranking claim',
]) {
  assert.ok(tests.includes(required), `Prescriptive adversarial test missing: ${required}`)
}

console.log('Prescriptive review gate adversarial audit passed.')
