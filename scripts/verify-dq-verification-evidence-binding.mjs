import fs from 'node:fs'
import assert from 'node:assert/strict'

const verifier = fs.readFileSync('lib/data-quality/remediation-verification.ts', 'utf8')
const integrity = fs.readFileSync('lib/data-quality/remediation-verification-integrity.ts', 'utf8')
const reprofile = fs.readFileSync('lib/data-quality/remediation-reprofile.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260912032000_backfill_dq_verification_profile_linkage.sql', 'utf8')

for (const field of ['verification_agent_run_id', 'verification_profile_run_id', 'verification_generation']) {
  assert.ok(verifier.includes(field), `Verification authority must load ${field}.`)
}
assert.ok(verifier.includes('assertDataQualityVerificationBinding('), 'Verdict path must invoke the exact evidence-binding assertion.')
assert.ok(verifier.includes('expectedVerificationProfileRunId'), 'Verdict path must resolve authoritative profile linkage including legacy evidence.')
assert.ok(verifier.includes("verificationProfile.status !== 'COMPLETED'"), 'Linked verification profile must be completed before a verdict.')
assert.ok(verifier.includes('verificationProfile.dataset_version_id !== verificationRun.dataset_version_id'), 'Verification run and fresh profile must share dataset version.')
assert.ok(verifier.includes('...priorOutcome'), 'Verification verdict must preserve existing remediation evidence instead of overwriting it.')
assert.ok(verifier.includes('verification_evidence_binding'), 'Persisted verification checks must expose the evidence binding.')

for (const code of [
  'DQ_VERIFICATION_AGENT_NOT_LINKED',
  'DQ_VERIFICATION_AGENT_MISMATCH',
  'DQ_VERIFICATION_WORKFLOW_MISMATCH',
  'DQ_VERIFICATION_GENERATION_MISMATCH',
  'DQ_VERIFICATION_TRIGGER_MISMATCH',
  'DQ_VERIFICATION_PROFILE_MISMATCH',
]) assert.ok(integrity.includes(code), `Missing fail-closed binding code ${code}.`)

assert.ok(integrity.includes("trigger !== 'DATA_QUALITY_REMEDIATION_VERIFICATION'"), 'Current verification generations must be created by the governed remediation trigger.')
assert.ok(reprofile.includes("trigger: 'DATA_QUALITY_REMEDIATION_VERIFICATION'"), 'Fresh profile workflow must queue the governed Data Quality verification trigger.')
assert.ok(reprofile.includes('verification_profile_run_id: profileRun.id'), 'Fresh profile workflow must persist exact verification profile linkage.')
assert.ok(reprofile.includes('verificationGeneration: generation'), 'Fresh verification workflow must carry generation into the agent run.')

assert.ok(migration.includes('outcome.verification_profile_run_id is null'), 'Backfill must never replace an existing authoritative profile linkage.')
assert.ok(migration.includes("profile.id::text = outcome.outcome ->> 'verification_profile_run_id'"), 'Legacy profile linkage must resolve through an existing authoritative profile row.')
assert.ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.test(migration), 'Backfill migration must be generic and contain no hard-coded production UUIDs.')
assert.ok(!migration.includes('::uuid'), 'Backfill must not cast untrusted legacy JSON text directly to UUID.')

console.log('Data Quality verification evidence-binding verifier passed.')
