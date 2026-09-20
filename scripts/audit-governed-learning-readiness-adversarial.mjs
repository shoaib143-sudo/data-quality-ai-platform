import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { evaluateGovernedLearningProductionReadiness } = await import(
  '../lib/agents/governed-learning-production-readiness.ts'
)

const base = {
  requiredTablesPresent: true,
  requiredRlsEnabled: true,
  allEightAgentsCovered: true,
  activeDataGovernanceAdminBindingCount: 1,
  successfulGovernedRunCount: 10,
  canonicallyVerifiedRunCount: 10,
  positiveCaseCount: 5,
  approvedPositiveCaseCount: 5,
  productionEligibleApprovedPositiveCaseCount: 0,
  appliedPositiveCaseUsageCount: 5,
  successfulPositiveCaseUsageCount: 5,
  productionEligibleSuccessfulPositiveCaseUsageCount: 0,
}

const syntheticOnly = evaluateGovernedLearningProductionReadiness(base)
assert.notEqual(syntheticOnly.status, 'CERTIFIED', 'non-production learning evidence must never certify')
assert.equal(syntheticOnly.status, 'EVIDENCE_IN_PROGRESS')

const mixedApprovalNoProductionReuse = evaluateGovernedLearningProductionReadiness({
  ...base,
  productionEligibleApprovedPositiveCaseCount: 2,
})
assert.notEqual(
  mixedApprovalNoProductionReuse.status,
  'CERTIFIED',
  'production-eligible approval without production-eligible successful reuse must not certify',
)

const productionReuseWithoutProductionApproval = evaluateGovernedLearningProductionReadiness({
  ...base,
  productionEligibleSuccessfulPositiveCaseUsageCount: 2,
})
assert.notEqual(
  productionReuseWithoutProductionApproval.status,
  'CERTIFIED',
  'successful production reuse cannot compensate for missing production-eligible approval evidence',
)

const certified = evaluateGovernedLearningProductionReadiness({
  ...base,
  productionEligibleApprovedPositiveCaseCount: 2,
  productionEligibleSuccessfulPositiveCaseUsageCount: 2,
})
assert.equal(certified.status, 'CERTIFIED')
assert.equal(certified.controls.syntheticEvidenceMayCertify, false)
assert.equal(certified.controls.productionEligibleEvidenceRequiredForCertification, true)
assert.equal(certified.controls.selfPromotionAllowed, false)
assert.equal(certified.controls.authorizationBypassAllowed, false)

const provenanceMigration = fs.readFileSync(
  'supabase/migrations/20260920016000_pgcl_production_learning_provenance.sql',
  'utf8',
)
for (const invariant of [
  "classification in ('PRODUCTION_ELIGIBLE','SYNTHETIC_OR_TEST')",
  'production_eligible boolean not null',
  'synthetic_or_test_detected boolean not null',
  'PGCL source run has no trusted production learning provenance',
  'synthetic or test evidence is not eligible for PGCL production learning',
  'unclassified or non-production PGCL evidence cannot be approved for reusable learning',
  'plc.production_eligible = true',
]) {
  assert.ok(provenanceMigration.includes(invariant), `missing production provenance defense: ${invariant}`)
}

const readiness = fs.readFileSync(
  'lib/agents/governed-learning-production-readiness.ts',
  'utf8',
)
for (const invariant of [
  'productionEligibleApprovedPositiveCaseCount',
  'productionEligibleSuccessfulPositiveCaseUsageCount',
  'productionEligibleEvidenceRequiredForCertification: true',
]) {
  assert.ok(readiness.includes(invariant), `missing production certification boundary: ${invariant}`)
}

assert.equal(
  /syntheticEvidenceMayCertify:\s*true/.test(readiness),
  false,
  'readiness must never expose a synthetic-evidence certification switch',
)

console.log('Adversarial readiness audit rejects synthetic, unclassified, and partially production-eligible evidence as certification proof.')
