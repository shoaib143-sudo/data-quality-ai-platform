import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260921151500_isolate_cloudflare_observability_canary_claim.sql', 'utf8')

test('general CORE worker excludes Cloudflare canary OBSERVABILITY rows', () => {
  assert.match(migration, /v_pool = 'CORE'/)
  assert.match(migration, /q\.job_type = 'OBSERVABILITY'/)
  assert.match(migration, /q\.payload->>'executionLane'/)
  assert.match(migration, /CLOUDFLARE_CANARY/)
  assert.match(migration, /and not \(/)
})

test('dedicated Cloudflare claim requires both OBSERVABILITY type and canary marker', () => {
  assert.match(migration, /v_type <> 'OBSERVABILITY'/)
  assert.match(migration, /q\.job_type = v_type/)
  assert.match(migration, /coalesce\(q\.payload->>'executionLane', ''\) = 'CLOUDFLARE_CANARY'/)
})

test('both claim paths preserve row locking, dependencies, capacity and replay fencing', () => {
  assert.ok((migration.match(/for update of q skip locked/gi) ?? []).length >= 2)
  assert.ok((migration.match(/lease_owner = p_worker/g) ?? []).length >= 2)
  assert.ok((migration.match(/lease_expires_at > now\(\)/g) ?? []).length >= 2)
  assert.ok((migration.match(/job_dependencies/g) ?? []).length >= 2)
  assert.ok((migration.match(/max_concurrent_jobs/g) ?? []).length >= 2)
})

test('claim RPC execution remains service-role only', () => {
  assert.match(migration, /revoke execute on function orchestration\.claim_jobs_by_pool\(text,text,integer\) from public,anon,authenticated/i)
  assert.match(migration, /grant execute on function orchestration\.claim_jobs_by_pool\(text,text,integer\) to service_role/i)
  assert.match(migration, /revoke execute on function orchestration\.claim_jobs_by_type\(text,text,integer\) from public,anon,authenticated/i)
  assert.match(migration, /grant execute on function orchestration\.claim_jobs_by_type\(text,text,integer\) to service_role/i)
})
