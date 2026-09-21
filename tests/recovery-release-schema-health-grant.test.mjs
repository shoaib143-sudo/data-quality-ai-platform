import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260922073500_recovery_actions_service_role_health_read.sql', 'utf8')
const releaseSchema = fs.readFileSync('app/api/health/release-schema/route.ts', 'utf8')

test('release-schema recovery health dependency has an explicit service-role read grant', () => {
  assert.match(releaseSchema, /tableCheck\(admin, 'orchestration', 'recovery_actions', 'execution_token'\)/)
  assert.match(migration, /grant select on table orchestration\.recovery_actions to service_role;/)
  assert.doesNotMatch(migration, /grant .* to authenticated/i)
  assert.doesNotMatch(migration, /grant .* to anon/i)
})
