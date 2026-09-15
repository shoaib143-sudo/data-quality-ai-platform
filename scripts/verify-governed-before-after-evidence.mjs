import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const analysisSource = fs.readFileSync(path.join(root, 'lib/data-quality/governed-before-after-evidence.ts'), 'utf8')
const serviceSource = fs.readFileSync(path.join(root, 'lib/data-quality/governed-before-after-evidence-service.ts'), 'utf8')
const routeSource = fs.readFileSync(path.join(root, 'app/api/analytics/governed-before-after-evidence/route.ts'), 'utf8')

for (const required of [
  "BEFORE_AFTER_EVIDENCE_VERSION = 'before-after-evidence-v1'",
  "status: 'OK' | 'INSUFFICIENT_EVIDENCE'",
  "reason: 'MISSING_BEFORE'",
  "'MISSING_AFTER'",
  "'TYPE_MISMATCH'",
  "'UNSUPPORTED_TYPE'",
  "'NON_FINITE_NUMBER'",
  "numericMovement: 'INCREASED' | 'DECREASED' | 'UNCHANGED' | null",
  "direction_is_not_improvement: true",
  "effectiveness_claimed: false",
  "predictive_probability_exposed: false",
  "causal_effect_claimed: false",
  "analysisType: 'GOVERNED_BEFORE_AFTER_EVIDENCE_CHANGE'",
  "synthetic_demo_test_excluded: true",
  "same_key_required: true",
  "same_scalar_type_required: true",
]) {
  assert.ok(analysisSource.includes(required), `Before/after analysis contract is missing: ${required}`)
}

assert.ok(
  analysisSource.includes('const ready = caseSampleSize >= minimumCaseSampleSize'),
  'Aggregate evidence must require an explicit case sample threshold.',
)
assert.ok(
  analysisSource.includes('const aggregate = ready') && analysisSource.includes(': null'),
  'Sparse evidence must fail closed by withholding aggregate output.',
)
assert.ok(
  analysisSource.includes("metadata[key] === true") && analysisSource.includes("environment === 'TEST'"),
  'Synthetic/test/demo metadata must be excluded from production analysis.',
)
assert.ok(
  !analysisSource.includes('predictionProbability') && !analysisSource.includes('causalEffect'),
  'Before/after evidence analysis must not expose predictive or causal output fields.',
)

for (const required of [
  ".from('remediation_knowledge')",
  ".from('governed_action_outcomes')",
  ".eq('verification_state', 'VERIFIED')",
  ".in('execution_state', ['EXECUTED', 'ROLLED_BACK', 'FAILED'])",
  ".lte('recorded_at', input.evidenceCutoffAt)",
  'persist?: boolean',
  ".from('analysis_evidence_envelopes')",
  'explicitSyntheticOrTestFlag(context) || explicitSyntheticOrTestFlag(runtime)',
  "...(explicitlyExcluded ? { synthetic: true } : {})",
  'mergeMetadataPreservingExclusionFlags(row.evidence_context, row.runtime_evidence)',
]) {
  assert.ok(serviceSource.includes(required), `Before/after service contract is missing: ${required}`)
}

for (const required of [
  'await requireUser()',
  "await authorizeProject(user.id, projectId, 'agent.view')",
  'runGovernedBeforeAfterEvidenceAnalysis({',
  'persist: false',
  'descriptive_observation_only: true',
  'numeric_direction_is_not_improvement: true',
  'effectiveness_claimed: false',
  'current_authorization_required: true',
  "value < 1 || value > 1000",
]) {
  assert.ok(routeSource.includes(required), `Before/after API contract is missing: ${required}`)
}

assert.ok(!routeSource.includes('persist: true'), 'Read-only before/after API must never persist analysis state.')

console.log('Governed before/after evidence contract verification passed.')
