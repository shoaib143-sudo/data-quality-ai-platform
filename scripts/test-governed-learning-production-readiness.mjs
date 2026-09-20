import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'

const { evaluateGovernedLearningProductionReadiness } = await import(
  '../lib/agents/governed-learning-production-readiness.ts'
)

const structural = {
  requiredTablesPresent: true,
  requiredRlsEnabled: true,
  allEightAgentsCovered: true,
  activeDataGovernanceAdminBindingCount: 1,
  successfulGovernedRunCount: 1,
  canonicallyVerifiedRunCount: 1,
  positiveCaseCount: 0,
  approvedPositiveCaseCount: 0,
  appliedPositiveCaseUsageCount: 0,
  successfulPositiveCaseUsageCount: 0,
}

const blocked = evaluateGovernedLearningProductionReadiness({
  ...structural,
  activeDataGovernanceAdminBindingCount: 0,
})
assert.equal(blocked.status, 'BLOCKED')
assert.ok(blocked.blockers.includes('NO_ACTIVE_DATA_GOVERNANCE_ADMIN_BINDING'))
assert.equal(blocked.controls.syntheticEvidenceMayCertify, false)
assert.equal(blocked.controls.selfPromotionAllowed, false)
assert.equal(blocked.controls.authorizationBypassAllowed, false)

const ready = evaluateGovernedLearningProductionReadiness(structural)
assert.equal(ready.status, 'READY_FOR_PROOF')
assert.deepEqual(ready.blockers, [])

const inProgress = evaluateGovernedLearningProductionReadiness({
  ...structural,
  positiveCaseCount: 1,
})
assert.equal(inProgress.status, 'EVIDENCE_IN_PROGRESS')

const approvedWithoutReuse = evaluateGovernedLearningProductionReadiness({
  ...structural,
  positiveCaseCount: 1,
  approvedPositiveCaseCount: 1,
})
assert.equal(approvedWithoutReuse.status, 'EVIDENCE_IN_PROGRESS')

const appliedWithoutSuccess = evaluateGovernedLearningProductionReadiness({
  ...structural,
  positiveCaseCount: 1,
  approvedPositiveCaseCount: 1,
  appliedPositiveCaseUsageCount: 1,
})
assert.equal(appliedWithoutSuccess.status, 'EVIDENCE_IN_PROGRESS')

const certified = evaluateGovernedLearningProductionReadiness({
  ...structural,
  positiveCaseCount: 1,
  approvedPositiveCaseCount: 1,
  appliedPositiveCaseUsageCount: 0,
  successfulPositiveCaseUsageCount: 1,
})
assert.equal(certified.status, 'CERTIFIED')
assert.equal(certified.controls.humanReviewRequired, true)
assert.equal(certified.controls.successfulReuseRequiredForCertification, true)
assert.equal(certified.evidence.appliedPositiveCaseUsageCount, 0, 'SUCCEEDED is the terminal proof of prior application')

const missingStructural = evaluateGovernedLearningProductionReadiness({
  ...structural,
  requiredTablesPresent: false,
  requiredRlsEnabled: false,
  allEightAgentsCovered: false,
})
assert.equal(missingStructural.status, 'BLOCKED')
assert.deepEqual(missingStructural.blockers, [
  'REQUIRED_PHASE11_TABLES_MISSING',
  'REQUIRED_PHASE11_RLS_MISSING',
  'ALL_EIGHT_AGENT_PGCL_COVERAGE_MISSING',
])

assert.throws(
  () => evaluateGovernedLearningProductionReadiness({
    ...structural,
    successfulGovernedRunCount: -1,
  }),
  /successfulGovernedRunCount must be a non-negative integer/,
)

console.log('Governed learning production readiness remains fail-closed until human-reviewed learning is successfully reused with canonical evidence.')
