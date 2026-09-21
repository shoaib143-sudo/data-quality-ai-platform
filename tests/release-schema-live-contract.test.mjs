import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync('app/api/health/release-schema/route.ts', 'utf8')
const pgclMigration = fs.readFileSync('supabase/migrations/20260920014000_proactive_governed_case_learning.sql', 'utf8')
const healthMigration = fs.readFileSync('supabase/migrations/20260922054500_release_schema_health_contract_fix.sql', 'utf8')

test('release schema checks canonical PGCL review_status column', () => {
  assert.match(pgclMigration, /review_status text not null/)
  assert.match(route, /tableCheck\(admin, 'agent', 'positive_learning_cases', 'review_status'\)/)
  assert.doesNotMatch(route, /positive_learning_cases', 'production_eligible'/)
})

test('release schema keeps recovery crash-fencing evidence', () => {
  assert.match(route, /tableCheck\(admin, 'orchestration', 'recovery_actions', 'execution_token'\)/)
  assert.match(route, /recovery_crash_fencing/)
})

test('release health receives read-only recovery access', () => {
  assert.match(healthMigration, /grant select on table orchestration\.recovery_actions to service_role;/)
  assert.doesNotMatch(healthMigration, /grant (insert|update|delete|all)/i)
})
