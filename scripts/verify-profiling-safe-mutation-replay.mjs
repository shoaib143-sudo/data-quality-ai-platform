import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260912005500_profiling_safe_mutation_replay.sql', 'utf8')
const adapter = readFileSync('lib/profiling/replay-safe-tools.ts', 'utf8')
const executor = readFileSync('lib/agents/executors/profiling-executor.ts', 'utf8')

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

for (const fn of [
  'profiling.persist_profile_snapshot_replay_safe',
  'profiling.complete_profile_run_replay_safe',
]) {
  contains(migration, `create or replace function ${fn}`, `${fn} definition`)
  contains(migration, `grant execute on function ${fn}`, `${fn} service-role grant`)
}
contains(migration, 'security definer', 'security definer boundary')
contains(migration, "set search_path = ''", 'empty security-definer search path')
contains(migration, 'for update;', 'row-lock replay serialization')
contains(migration, "v_run.error_code is not distinct from p_error_code", 'completion error-code replay equality')
contains(migration, "v_run.error_message is not distinct from p_error_message", 'completion error-message replay equality')
contains(migration, "where profile_run_id = p_profile_run_id;", 'existing snapshot lookup')
contains(migration, "'read_only', false", 'mutation classification')
contains(migration, "'idempotent', true", 'idempotency certification')
contains(migration, "'replay_certified', true", 'replay certification')
contains(migration, "'reversible', false", 'non-reversible classification')
contains(migration, "'compensatable', false", 'non-compensatable classification')
contains(migration, "'approval_required', false", 'contract approval flag')
contains(migration, "'retryable_error_codes', jsonb_build_array('STEP_FAILED')", 'bounded replay error certification')
contains(migration, "t.tool_key = any(array[\n    'persist_profile_snapshot',\n    'complete_profile_run'", 'two-tool contract scope')
contains(migration, 'if v_certified <> 2 then', 'two-tool database postcondition')

contains(adapter, ".rpc('persist_profile_snapshot_replay_safe'", 'snapshot RPC adapter')
contains(adapter, ".rpc('complete_profile_run_replay_safe'", 'completion RPC adapter')
contains(adapter, 'profiling_run_id: returnedRunId', 'native output run id')
contains(adapter, 'snapshot_id:', 'native snapshot output')
contains(adapter, 'schema_hash:', 'native snapshot hash output')
contains(adapter, 'status: returnedStatus', 'native completion status output')

contains(executor, "'persist_profile_snapshot',\n  'complete_profile_run'", 'dataset-version optional mutation operations')
contains(executor, "case 'persist_profile_snapshot':\n        result = await persistProfileSnapshotReplaySafe(toolInput); break", 'snapshot safe routing')
contains(executor, "case 'complete_profile_run':\n        result = await completeProfileRunReplaySafe(toolInput); break", 'completion safe routing')
assert.ok(
  executor.indexOf("case 'persist_profile_snapshot':") < executor.indexOf('default:'),
  'snapshot safe route must precede the legacy default executor',
)
assert.ok(
  executor.indexOf("case 'complete_profile_run':") < executor.indexOf('default:'),
  'completion safe route must precede the legacy default executor',
)

console.log('Profiling replay-safe mutation contracts verified.')
