import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260912011500_profiling_compare_replay.sql', 'utf8')
const comparison = readFileSync('lib/profiling/replay-safe-comparison.ts', 'utf8')
const executor = readFileSync('lib/agents/executors/profiling-executor.ts', 'utf8')

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

const functionName = 'profiling.persist_profile_comparison_replay_safe'
contains(migration, `create or replace function ${functionName}`, 'comparison replay function')
contains(migration, 'security definer', 'security definer boundary')
contains(migration, "set search_path = ''", 'empty security-definer search path')
contains(migration, `revoke all on function ${functionName}`, 'public/authenticated function revoke')
contains(migration, `grant execute on function ${functionName}`, 'service-role function grant')
contains(migration, 'pg_catalog.pg_advisory_xact_lock', 'comparison replay serialization')
contains(migration, "where current_profile_run_id = p_current_profile_run_id", 'existing comparison identity lookup')
contains(migration, "and comparison_type = 'BASELINE';", 'baseline comparison identity')
contains(migration, "if v_current.status not in ('COMPLETED', 'PARTIAL')", 'current terminal-run guard')
contains(migration, "or v_baseline.status not in ('COMPLETED', 'PARTIAL')", 'baseline terminal-run guard')
contains(migration, 'insert into profiling.profile_comparisons', 'comparison evidence insert')
contains(migration, 'insert into profiling.profile_anomalies', 'anomaly evidence insert')
contains(migration, 'on conflict do nothing;', 'anomaly deduplication conflict handling')
contains(migration, "'profiling_agent_2.0'", 'forced comparison detector identity')
contains(migration, "t.tool_key = 'compare_profiles'", 'single-tool contract scope')
contains(migration, "'read_only', false", 'comparison mutation classification')
contains(migration, "'idempotent', true", 'comparison idempotency certification')
contains(migration, "'replay_certified', true", 'comparison replay certification')
contains(migration, "'reversible', false", 'comparison non-reversible classification')
contains(migration, "'compensatable', false", 'comparison non-compensatable classification')
contains(migration, "'approval_required', false", 'comparison contract approval flag')
contains(migration, "'retryable_error_codes', jsonb_build_array('STEP_FAILED')", 'bounded comparison retry certification')
contains(migration, 'if v_certified <> 1 then', 'single-tool database postcondition')

const existingLookup = migration.indexOf('select * into v_existing')
const comparisonInsert = migration.indexOf('insert into profiling.profile_comparisons')
const anomalyInsert = migration.indexOf('insert into profiling.profile_anomalies')
assert.ok(existingLookup >= 0 && existingLookup < comparisonInsert, 'existing comparison lookup must occur before comparison insert')
assert.ok(comparisonInsert >= 0 && comparisonInsert < anomalyInsert, 'comparison must be persisted before anomaly evidence')

contains(comparison, ".order('metric_key', { ascending: true })", 'deterministic metric ordering')
contains(comparison, ".sort((left, right) =>", 'deterministic change ordering')
contains(comparison, ".rpc('persist_profile_comparison_replay_safe'", 'comparison replay RPC adapter')
contains(comparison, 'p_current_profile_run_id: targetProfileRunId', 'target run binding')
contains(comparison, 'p_baseline_profile_run_id: baselineProfileRunId', 'baseline run binding')
contains(comparison, "status !== 'COMPLETED'", 'persistence contract status validation')
contains(comparison, 'comparison_id: comparisonId,', 'native comparison output id')
contains(comparison, 'metrics_changed: metricsChanged,', 'native comparison metric count output')
contains(comparison, 'anomalies_found: anomaliesFound,', 'native comparison anomaly count output')

contains(executor, "import { compareProfilesReplaySafe } from '@/lib/profiling/replay-safe-comparison'", 'safe comparison executor import')
assert.ok(!executor.includes('import { compareProfiles,'), 'native profiling executor must not import the legacy comparison writer')
contains(executor, "case 'compare_profiles':", 'comparison executor route')
contains(executor, 'result = await compareProfilesReplaySafe({ baselineProfileRunId, targetProfileRunId }); break', 'safe comparison execution')
assert.ok(
  executor.indexOf("case 'compare_profiles':") < executor.indexOf('default:'),
  'safe comparison route must precede the legacy default executor',
)

console.log('Profiling replay-safe comparison contract verified.')
