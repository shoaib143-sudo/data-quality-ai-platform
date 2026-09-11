import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const requiredFiles = [
  'docs/recovery-assurance-v2.md',
  'docs/recovery-business-impact-analysis.md',
  'docs/recovery-portable-backup-and-local-restore.md',
  'docs/recovery-full-platform-scopes.md',
  'infra/recovery/platform-manifest.json',
  'infra/recovery/migration-history-aliases.json',
  'infra/recovery/portable-backup-contract.json',
  'infra/recovery/full-platform-recovery-contract.json',
  'scripts/recovery-drill.mjs',
  'scripts/recovery/recovery-integrity.mjs',
  'scripts/recovery/create-portable-backup.mjs',
  'scripts/recovery/restore-portable-backup-local.mjs',
  'scripts/test-recovery-assurance.mjs',
  'scripts/verify-recovery-source-authority.mjs',
  'scripts/verify-portable-recovery.mjs',
  'scripts/verify-full-platform-recovery-scopes.mjs',
  'supabase/config.toml',
  'supabase/functions/profiling-executor/index.ts',
  'supabase/functions/profiling-executor/deno.json',
  'supabase/functions/connection-health-check/index.ts',
  'supabase/migrations/20260912000000_recovery_assurance_v2.sql',
  '.github/workflows/recovery-assurance.yml',
]

for (const path of requiredFiles) {
  await access(path, constants.R_OK)
  console.log(`PASS required recovery artifact ${path}`)
}

const migration = await readFile('supabase/migrations/20260912000000_recovery_assurance_v2.sql', 'utf8')
for (const [pattern, label] of [
  [/required_scopes[\s\S]*DATABASE[\s\S]*STORAGE[\s\S]*IDENTITY_CONFIG[\s\S]*APPLICATION_CONFIG[\s\S]*EDGE_RUNTIME[\s\S]*DEPENDENCIES[\s\S]*SERVICE_VALIDATION/, 'required full-platform recovery scopes'],
  [/scope_results jsonb/, 'scope-level recovery evidence'],
  [/external_evidence_ref/, 'independent recovery evidence reference'],
  [/incident_at[\s\S]*recovery_point_at/, 'authoritative recovery-point inputs'],
  [/service_ready_at/, 'service-ready RTO boundary'],
  [/recovery_scope_coverage/, 'scope coverage evaluation'],
  [/SCOPE_COVERAGE_INCOMPLETE/, 'fail-closed incomplete coverage state'],
  [/EXTERNAL_EVIDENCE_REQUIRED/, 'fail-closed external evidence state'],
  [/TIMING_EVIDENCE_REQUIRED/, 'fail-closed authoritative timing state'],
  [/new\.measured_rpo_minutes := greatest[\s\S]*new\.measured_rto_minutes := greatest/, 'database-derived RPO and RTO'],
  [/recovery_mechanism[\s\S]*MANAGED_PITR[\s\S]*MANAGED_BACKUP[\s\S]*PORTABLE_LOGICAL_EXPORT/, 'explicit recovery mechanism evidence'],
]) {
  if (!pattern.test(migration)) throw new Error(`Recovery Assurance v2 contract failed: ${label} is missing from migration.`)
  console.log(`PASS ${label}`)
}

const drill = await readFile('scripts/recovery-drill.mjs', 'utf8')
for (const [pattern, label] of [
  [/ALLOW_RECOVERY_TARGET/, 'explicit destructive recovery confirmation'],
  [/fingerprint\(source\)\s*===\s*fingerprint\(recovery\)/, 'source and recovery isolation'],
  [/pg_dump/, 'portable logical export'],
  [/pg_restore/, 'isolated restore execution'],
  [/sha256/, 'backup integrity checksum'],
  [/assertSnapshotParity/, 'source and restored data parity'],
  [/auditChainValid/, 'audit-chain recovery validation'],
  [/storageObjects/, 'storage metadata parity'],
  [/scope_results|scopeResults/, 'scope-level drill evidence'],
  [/PORTABLE_LOGICAL_EXPORT/, 'explicit logical-export recovery mechanism'],
  [/platformRpoMeasured:\s*false/, 'no synthetic platform RPO'],
  [/platformRtoMeasured:\s*false/, 'no synthetic platform RTO'],
]) {
  if (!pattern.test(drill)) throw new Error(`Recovery drill v2 contract failed: ${label} is missing.`)
  console.log(`PASS ${label}`)
}

const workflow = await readFile('.github/workflows/recovery-assurance.yml', 'utf8')
for (const [pattern, label] of [
  [/workflow_dispatch:/, 'manual recovery workflow entry point'],
  [/schedule:/, 'scheduled recovery contract verification'],
  [/verify:recovery-assurance/, 'recovery assurance verification execution'],
  [/upload-artifact/, 'independent workflow evidence artifact'],
  [/RECOVERY_EXTERNAL_EVIDENCE_REF/, 'workflow evidence reference propagation'],
]) {
  if (!pattern.test(workflow)) throw new Error(`Recovery workflow contract failed: ${label} is missing.`)
  console.log(`PASS ${label}`)
}

const runbook = await readFile('docs/recovery-assurance-v2.md', 'utf8')
for (const [pattern, label] of [
  [/managed Supabase backup\/PITR/i, 'managed recovery primary path'],
  [/portable logical database export/i, 'portable recovery fallback'],
  [/Storage object bytes/i, 'storage bytes recovery scope'],
  [/deployment rollback.*distinct from disaster recovery/i, 'rollback versus disaster recovery boundary'],
  [/RPO must be derived/i, 'authoritative RPO measurement'],
  [/RTO starts when recovery begins and ends only after/i, 'service-level RTO measurement'],
]) {
  if (!pattern.test(runbook)) throw new Error(`Recovery runbook contract failed: ${label} is missing.`)
  console.log(`PASS ${label}`)
}

const manifest = JSON.parse(await readFile('infra/recovery/platform-manifest.json', 'utf8'))
if (manifest.schemaVersion !== 1) throw new Error('Recovery platform manifest must use schemaVersion 1.')
if (!manifest.supabase?.projectRef || !Array.isArray(manifest.supabase.requiredEdgeFunctions) || manifest.supabase.requiredEdgeFunctions.length === 0) {
  throw new Error('Recovery platform manifest must identify Supabase project topology and required Edge Functions.')
}
if (!manifest.vercel?.projectId || !Array.isArray(manifest.vercel.requiredDomains) || manifest.vercel.requiredDomains.length === 0) {
  throw new Error('Recovery platform manifest must identify Vercel project topology and domains.')
}
if (!Array.isArray(manifest.render?.requiredServices) || manifest.render.requiredServices.length < 3) {
  throw new Error('Recovery platform manifest must identify all required Render services.')
}
if (manifest.secretPolicy?.storeSecretValuesInRepository !== false) {
  throw new Error('Recovery platform manifest must explicitly prohibit secret values in the repository.')
}
console.log('PASS recoverable production platform manifest')

await import('./test-recovery-assurance.mjs')
await import('./verify-recovery-source-authority.mjs')
await import('./verify-portable-recovery.mjs')
await import('./verify-full-platform-recovery-scopes.mjs')
console.log('Recovery Assurance v2 static and behavioral verification completed.')
