import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260912024500_profiling_dataset_replay.sql', 'utf8')
const replay = readFileSync('lib/profiling/profile-dataset-replay.ts', 'utf8')
const executor = readFileSync('lib/agents/executors/profiling-executor.ts', 'utf8')
const tableProfile = readFileSync('lib/profiling/executor.ts', 'utf8')
const jdbcProfile = readFileSync('lib/profiling/jdbc-profile.ts', 'utf8')
const fileProfile = readFileSync('lib/profiling/file-profile.ts', 'utf8')
const documentContent = readFileSync('lib/governance/document-content.ts', 'utf8')

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

for (const fn of [
  'profiling.claim_profile_dataset_replay',
  'profiling.persist_profile_dataset_evidence_replay_safe',
  'profiling.complete_profile_dataset_replay',
  'profiling.fail_profile_dataset_replay',
]) {
  contains(migration, `create or replace function ${fn}`, `${fn} definition`)
  contains(migration, `grant execute on function ${fn}`, `${fn} service-role grant`)
}
contains(migration, 'create table if not exists profiling.profile_dataset_replays', 'profile dataset replay ledger')
contains(migration, 'alter table profiling.profile_dataset_replays enable row level security', 'profile dataset replay RLS')
contains(migration, 'revoke all on table profiling.profile_dataset_replays from public, anon, authenticated', 'profile dataset table ACL')
contains(migration, "set search_path = ''", 'empty security-definer search path')
contains(migration, 'pg_advisory_xact_lock', 'profile dataset claim serialization')
contains(migration, "v_run.summary->'profile_dataset_evidence'", 'atomic evidence crash marker')
contains(migration, "delete from profiling.profile_columns where profile_run_id = p_profile_run_id", 'transactional profile column replacement')
contains(migration, 'insert into profiling.schema_snapshots', 'transactional schema snapshot persistence')
contains(migration, "metric_key='schema_hash'", 'transactional schema hash evidence')
contains(migration, "'profile_dataset_evidence'", 'durable replay marker')
contains(migration, "'replay_certified',true", 'profile dataset replay certification')
contains(migration, "'reversible',false", 'profile dataset non-reversible classification')
contains(migration, "'compensatable',false", 'profile dataset non-compensatable classification')
contains(migration, "t.tool_key='profile_dataset'", 'profile_dataset-only certification scope')
contains(migration, 'if v_certified <> 1 then', 'single profile dataset certification postcondition')

contains(replay, ".rpc('claim_profile_dataset_replay'", 'profile dataset claim RPC')
contains(replay, ".rpc('persist_profile_dataset_evidence_replay_safe'", 'atomic persistence RPC adapter')
contains(replay, ".rpc('complete_profile_dataset_replay'", 'profile dataset completion RPC')
contains(replay, ".rpc('fail_profile_dataset_replay'", 'profile dataset failure RPC')
contains(replay, "if (claim.status === 'COMPLETED')", 'profile dataset replay fast path')
contains(replay, "if (claim.status === 'IN_PROGRESS')", 'profile dataset concurrent rejection')
contains(replay, 'const result = normalizeResult(await execute()', 'profile execution after claim')
contains(replay, "anomalies_found: requiredInteger", 'exact anomalies output')

const claimIndex = replay.indexOf(".rpc('claim_profile_dataset_replay'")
const executeIndex = replay.indexOf('const result = normalizeResult(await execute()')
assert.ok(claimIndex >= 0 && executeIndex > claimIndex, 'profile source execution must occur only after replay claim')

contains(executor, "import { executeProfileDatasetReplaySafe } from '@/lib/profiling/profile-dataset-replay'", 'profile dataset replay import')
contains(executor, 'result = await executeProfileDatasetReplaySafe({', 'profile dataset replay routing')
contains(executor, 'execute: async () => {', 'deferred connector execution')
const wrapperIndex = executor.indexOf('result = await executeProfileDatasetReplaySafe({')
const sourceLookupIndex = executor.indexOf("admin.schema('catalog').from('dataset_versions')", wrapperIndex)
assert.ok(wrapperIndex >= 0 && sourceLookupIndex > wrapperIndex, 'connector lookup must occur inside replay claim callback')

for (const [source, label] of [
  [tableProfile, 'table profile'],
  [jdbcProfile, 'JDBC profile'],
  [fileProfile, 'FILE profile'],
]) {
  contains(source, 'persistProfileDatasetEvidenceReplaySafe({', `${label} atomic persistence`)
}
assert.ok(!jdbcProfile.includes("from('profile_columns').delete()"), 'JDBC profile must not persist columns outside atomic RPC')
assert.ok(!fileProfile.includes("from('profile_columns').delete()"), 'FILE profile must not persist columns outside atomic RPC')

contains(documentContent, 'const documentMatches = Boolean(', 'governed document equality guard')
contains(documentContent, 'chunksMatch =', 'governed document chunk equality guard')
contains(documentContent, 'if (chunksMatch) {', 'identical governed document no-op')
const documentNoopIndex = documentContent.indexOf('if (chunksMatch) {')
const documentUpsertIndex = documentContent.indexOf(".from('documents')\n      .upsert")
assert.ok(documentNoopIndex >= 0 && documentUpsertIndex > documentNoopIndex, 'identical governed document must return before upsert')

console.log('Profiling dataset replay contracts verified.')
