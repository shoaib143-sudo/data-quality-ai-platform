import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260921153500_cloudflare_canary_single_flight.sql', 'utf8')

test('same-worker replay is evaluated before the single-flight guard', () => {
  const replay = migration.indexOf("q.lease_owner = p_worker")
  const guard = migration.indexOf("if exists (")
  assert.ok(replay >= 0)
  assert.ok(guard > replay)
  assert.match(migration, /lease_expires_at > now\(\)/)
})

test('a live canary lease blocks a second canary claim globally', () => {
  assert.match(migration, /globally single-flight/i)
  assert.match(migration, /q\.status = 'RUNNING'/)
  assert.match(migration, /q\.job_type = v_type/)
  assert.match(migration, /executionLane/)
  assert.match(migration, /CLOUDFLARE_CANARY/)
  assert.match(migration, /then\s+return;\s+end if;/i)
})

test('new canary claim returns after the first acquired job', () => {
  assert.match(migration, /return next v_claimed;\s+return;/i)
})

test('single-flight claim RPC remains service-role only', () => {
  assert.match(migration, /revoke execute on function orchestration\.claim_jobs_by_type\(text,text,integer\) from public,anon,authenticated/i)
  assert.match(migration, /grant execute on function orchestration\.claim_jobs_by_type\(text,text,integer\) to service_role/i)
})
