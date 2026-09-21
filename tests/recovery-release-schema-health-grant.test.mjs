import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260921030500_recovery_actions_service_role_health_read.sql', 'utf8')
const releaseSchema = fs.readFileSync('app/api/health/release-schema/route.ts', 'utf8')

test('recovery health verification receives only read access for service_role', () => {
  assert.match(migration, /grant select on table orchestration\.recovery_actions to service_role;/)
  assert.doesNotMatch(migration, /grant (insert|update|delete|all)/i)
})

test('release schema uses the crash-fencing execution token as evidence', () => {
  assert.match(releaseSchema, /tableCheck\(admin, 'orchestration', 'recovery_actions', 'execution_token'\)/)
  assert.match(releaseSchema, /recovery_crash_fencing/)
})
