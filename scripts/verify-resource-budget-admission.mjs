import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260909112000_adr006_atomic_project_budget_admission.sql', 'utf8')

for (const required of [
  'governance.ai_resource_budget_request_admissions',
  'governance.ai_resource_budget_concurrency_leases',
  'governance.acquire_ai_project_resource_budget_admission',
  'governance.release_ai_project_resource_budget_lease',
  'pg_advisory_xact_lock',
  "effective.scope_type = 'PROJECT'",
  "effective.scope_key = 'PROJECT'",
  'effective.id = p_policy_version_id',
  "'RATE_LIMIT'",
  "'CONCURRENCY_LIMIT'",
  "'POLICY_NOT_CURRENT'",
  "'POLICY_DISABLED'",
  "'ALREADY_ADMITTED'",
  'max_requests_per_minute',
  'max_concurrent_executions',
  "interval '1 minute'",
  'expires_at > v_now',
  'unique (policy_version_id, correlation_id)',
  'ai_resource_budget_policy_versions_project_lock',
]) {
  assert.ok(migration.includes(required), `atomic budget admission migration must include ${required}`)
}

assert.match(migration, /before insert on governance\.ai_resource_budget_policy_versions[\s\S]*lock_ai_project_resource_budget_policy_change/, 'project policy writes must share the admission lock')
assert.match(migration, /revoke all on function governance\.acquire_ai_project_resource_budget_admission[^;]+from public, anon, authenticated;/, 'admission RPC must not be client callable')
assert.match(migration, /grant execute on function governance\.acquire_ai_project_resource_budget_admission[^;]+to service_role;/, 'admission RPC must be service-role only')
assert.match(migration, /revoke insert, update, delete on governance\.ai_resource_budget_request_admissions from authenticated;/, 'authenticated clients must not mutate admission evidence')
assert.match(migration, /revoke insert, update, delete on governance\.ai_resource_budget_concurrency_leases from authenticated;/, 'authenticated clients must not mutate concurrency leases')
assert.ok(migration.includes('app_private.is_project_member(project_id)'), 'runtime accounting reads must remain project scoped')
assert.ok(migration.includes('It does not enforce cost/day or infer any price.'), 'migration must preserve the unresolved cost authority boundary')
assert.ok(!/max_cost_usd_per_day\s*[<>=]/.test(migration), 'atomic admission must not approximate daily cost enforcement')
assert.ok(!/ai_telemetry_events/.test(migration), 'runtime admission must not infer authority or counters from telemetry')
assert.ok(!/security\s+definer/i.test(migration), 'budget admission functions must remain security invoker')

console.log('ADR-006 atomic PROJECT request-rate and concurrency admission contract verified.')
