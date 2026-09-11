import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260912022000_profiling_metric_execution_replay.sql', 'utf8')
const replay = readFileSync('lib/profiling/metric-replay.ts', 'utf8')
const executor = readFileSync('lib/agents/executors/profiling-executor.ts', 'utf8')

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

for (const fn of [
  'profiling.claim_profile_metric_execution_replay',
  'profiling.complete_profile_metric_execution_replay',
  'profiling.fail_profile_metric_execution_replay',
]) {
  contains(migration, `create or replace function ${fn}`, `${fn} definition`)
  contains(migration, `grant execute on function ${fn}`, `${fn} service-role grant`)
}
contains(migration, 'create table if not exists profiling.profile_metric_execution_replays', 'metric replay ledger')
contains(migration, 'alter table profiling.profile_metric_execution_replays enable row level security', 'metric replay RLS')
contains(migration, 'revoke all on table profiling.profile_metric_execution_replays from public, anon, authenticated', 'metric replay table ACL')
contains(migration, "set search_path = ''", 'empty security-definer search path')
contains(migration, 'pg_advisory_xact_lock', 'claim serialization')
contains(migration, "v_run.status = 'COMPLETED'", 'crash recovery persisted evidence check')
contains(migration, 'validate_metric_execution_contract', 'persisted evidence validation')
contains(migration, "'metrics_persisted'", 'reconstructed native metrics count')
contains(migration, "'findings_persisted'", 'reconstructed native findings count')
contains(migration, "'replay_certified', true", 'metric replay certification')
contains(migration, "'reversible', false", 'metric non-reversible classification')
contains(migration, "'compensatable', false", 'metric non-compensatable classification')
contains(migration, "'retryable_error_codes', pg_catalog.jsonb_build_array('STEP_FAILED')", 'bounded retry certification')
contains(migration, "t.tool_key = 'execute_metrics'", 'execute_metrics-only certification scope')
contains(migration, 'if v_certified <> 1 then', 'single-tool certification postcondition')

contains(replay, ".rpc('claim_profile_metric_execution_replay'", 'claim RPC call')
contains(replay, ".rpc('complete_profile_metric_execution_replay'", 'complete RPC call')
contains(replay, ".rpc('fail_profile_metric_execution_replay'", 'failure RPC call')
contains(replay, "if (claim.status === 'COMPLETED')", 'completed replay fast-path')
contains(replay, "if (claim.status === 'IN_PROGRESS')", 'concurrent execution rejection')
contains(replay, 'const result = normalizeResult(await execute()', 'execution only after claim')
contains(replay, "status: 'COMPLETED' as const", 'exact native status')
contains(replay, 'metrics_persisted:', 'exact native metric count')
contains(replay, 'findings_persisted:', 'exact native finding count')
contains(replay, 'score:', 'exact native score')

const claimIndex = replay.indexOf(".rpc('claim_profile_metric_execution_replay'")
const executeIndex = replay.indexOf('const result = normalizeResult(await execute()')
assert.ok(claimIndex >= 0 && executeIndex > claimIndex, 'metric source execution must occur only after replay claim')

contains(executor, "import { executeProfilingMetricsReplaySafe } from '@/lib/profiling/metric-replay'", 'replay-safe metric import')
contains(executor, 'result = await executeProfilingMetricsReplaySafe({', 'replay-safe metric routing')
contains(executor, 'execute: () => executeProfilingMetrics(datasetVersionId, profilingRunId, {})', 'deferred metric execution callback')

console.log('Profiling metric replay contracts verified.')
