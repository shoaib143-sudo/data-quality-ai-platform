import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync('app/api/health/release-schema/route.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260920014000_proactive_governed_case_learning.sql', 'utf8')

test('release schema checks a canonical PGCL column that exists in the migration', () => {
  assert.match(migration, /review_status text not null/)
  assert.match(route, /tableCheck\(admin, 'agent', 'positive_learning_cases', 'review_status'\)/)
  assert.doesNotMatch(route, /positive_learning_cases', 'production_eligible'/)
})

test('release schema keeps recovery crash-fencing as a required contract check', () => {
  assert.match(route, /tableCheck\(admin, 'orchestration', 'recovery_actions', 'execution_token'\)/)
  assert.match(route, /recovery_crash_fencing/)
})
