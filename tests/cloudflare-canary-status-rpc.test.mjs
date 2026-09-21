import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260921154500_cloudflare_canary_status_rpc.sql', 'utf8')

test('status RPC exposes only non-secret canary state', () => {
  assert.match(migration, /get_cloudflare_observability_canary_status/)
  assert.match(migration, /runtime_configured/)
  assert.match(migration, /cron_active/)
  assert.match(migration, /single_flight_limit/)
  assert.match(migration, /allowed_job_type/)
  assert.match(migration, /scheduler_authority/)
  assert.doesNotMatch(migration, /jsonb_build_object\([\s\S]*decrypted_secret/)
})

test('status RPC remains service-role only', () => {
  assert.match(migration, /revoke all on function orchestration\.get_cloudflare_observability_canary_status\(\) from public,anon,authenticated/i)
  assert.match(migration, /grant execute on function orchestration\.get_cloudflare_observability_canary_status\(\) to service_role/i)
})

test('status RPC reports only canary-tagged OBSERVABILITY queue state', () => {
  assert.match(migration, /job_type = 'OBSERVABILITY'/)
  assert.match(migration, /executionLane/)
  assert.match(migration, /CLOUDFLARE_CANARY/)
})
