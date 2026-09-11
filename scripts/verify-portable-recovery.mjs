import { access, readFile } from 'node:fs/promises'
import { constants } from 'node:fs'

const requiredFiles = [
  'scripts/recovery/recovery-integrity.mjs',
  'scripts/recovery/create-portable-backup.mjs',
  'scripts/recovery/restore-portable-backup-local.mjs',
  'docs/recovery-portable-backup-and-local-restore.md',
  'infra/recovery/portable-backup-contract.json',
]

for (const path of requiredFiles) {
  await access(path, constants.R_OK)
  console.log(`PASS required portable recovery artifact ${path}`)
}

const backup = await readFile('scripts/recovery/create-portable-backup.mjs', 'utf8')
for (const [pattern, label] of [
  [/supabaseBinary[\s\S]*'db', 'dump'/, 'Supabase CLI database dump'],
  [/--role-only/, 'roles export'],
  [/--data-only[\s\S]*--use-copy|--use-copy[\s\S]*--data-only/, 'data export with COPY'],
  [/supabase_migrations/, 'migration history export'],
  [/storage\.buckets_vectors[\s\S]*storage\.vector_indexes/, 'documented vector-table exclusions'],
  [/RECOVERY_AGE_RECIPIENT/, 'recipient-based backup encryption'],
  [/age'[\s\S]*-r/, 'age encryption execution'],
  [/sourceStableDuringExport/, 'source-change detection across export window'],
  [/recoveryPointAt:\s*null/, 'no fabricated authoritative recovery point'],
  [/rpoProven:\s*false/, 'no fabricated RPO claim'],
  [/offProviderCopyVerified:\s*false/, 'no fabricated off-provider retention claim'],
]) {
  if (!pattern.test(backup)) throw new Error(`Portable backup contract failed: ${label} is missing.`)
  console.log(`PASS ${label}`)
}

if (/\bpg_dump\b/.test(backup)) {
  throw new Error('Portable backup creation must use Supabase CLI filtering, not raw pg_dump.')
}
console.log('PASS raw pg_dump is not used for governed portable backup creation')

const restore = await readFile('scripts/recovery/restore-portable-backup-local.mjs', 'utf8')
for (const [pattern, label] of [
  [/ALLOW_LOCAL_RECOVERY_TARGET/, 'explicit local destructive confirmation'],
  [/localhost[\s\S]*127\.0\.0\.1[\s\S]*::1/, 'loopback-only recovery target guard'],
  [/age'[\s\S]*--decrypt/, 'authenticated backup decryption'],
  [/verifyBundleFiles/, 'per-file integrity verification'],
  [/sourceStableDuringExport/, 'fail-closed source consistency requirement'],
  [/--single-transaction/, 'transactional restore execution'],
  [/session_replication_role = replica/, 'trigger-safe data restoration'],
  [/history_schema\.sql[\s\S]*history_data\.sql/, 'migration history restoration'],
  [/compareRecoveryIntegrity/, 'deterministic recovered-state comparison'],
  [/verify_audit_chain/, 'audit-chain validation'],
  [/rpoProven:\s*false/, 'no RPO claim from local restore'],
  [/platformRtoProven:\s*false/, 'no platform RTO claim from database restore'],
  [/fullPlatformReady:\s*false/, 'no full-platform readiness claim'],
]) {
  if (!pattern.test(restore)) throw new Error(`Portable restore contract failed: ${label} is missing.`)
  console.log(`PASS ${label}`)
}

const integrity = await readFile('scripts/recovery/recovery-integrity.mjs', 'utf8')
for (const [pattern, label] of [
  [/catalog\.datasets[\s\S]*catalog\.dataset_versions/, 'catalog content fingerprints'],
  [/profiling\.profile_runs[\s\S]*profiling\.profile_metrics/, 'profiling content fingerprints'],
  [/governance\.audit_events[\s\S]*governance\.semantic_embeddings/, 'governance content fingerprints'],
  [/auth\.users[\s\S]*storage\.buckets[\s\S]*storage\.objects/, 'auth and storage metadata fingerprints'],
  [/information_schema\.columns/, 'schema column fingerprint'],
  [/pg_policies/, 'RLS policy fingerprint'],
  [/pg_get_functiondef/, 'function fingerprint'],
  [/pg_get_triggerdef/, 'trigger fingerprint'],
  [/role_table_grants/, 'grant fingerprint'],
  [/supabase_migrations\.schema_migrations/, 'migration history fingerprint'],
]) {
  if (!pattern.test(integrity)) throw new Error(`Recovery integrity contract failed: ${label} is missing.`)
  console.log(`PASS ${label}`)
}

const contract = JSON.parse(await readFile('infra/recovery/portable-backup-contract.json', 'utf8'))
if (contract.schemaVersion < 2) throw new Error('Portable backup contract must be schemaVersion 2 or newer.')
if (contract.encryption?.mechanism !== 'age') throw new Error('Portable backup contract must require age encryption.')
if (contract.execution?.githubHostedProductionBackupAllowed !== false) throw new Error('Production backup execution must be forbidden on GitHub-hosted runners.')
if (contract.localRestore?.loopbackOnly !== true) throw new Error('Local restore contract must remain loopback-only by default.')
if (contract.consistency?.transactionalSnapshotProven !== false) throw new Error('Portable backup contract must not claim a shared transactional snapshot.')
if (contract.rpoCurrentlyProven !== false) throw new Error('60-minute RPO must remain unproven until authoritative evidence exists.')
console.log('PASS portable recovery contract remains encrypted, local-only, and fail closed')

const runbook = await readFile('docs/recovery-portable-backup-and-local-restore.md', 'utf8')
for (const [pattern, label] of [
  [/Supabase CLI/i, 'Supabase CLI backup authority'],
  [/age/i, 'age encryption requirement'],
  [/GitHub-hosted runner/i, 'trusted execution boundary'],
  [/separate dump operations/i, 'multi-dump consistency limitation'],
  [/Storage object bytes/i, 'storage byte boundary'],
  [/RPO/i, 'RPO truth boundary'],
  [/local Supabase/i, 'local recovery rehearsal'],
]) {
  if (!pattern.test(runbook)) throw new Error(`Portable recovery runbook failed: ${label} is missing.`)
  console.log(`PASS ${label}`)
}

console.log('Portable backup and local restore verification completed.')
