import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')
const runnerMigration = read('supabase/migrations/20261001152250_learning_experiment_runner_evidence.sql')
const budgetMigration = read('supabase/migrations/20261001004136_governed_learning_experiment_budget.sql')
const testingMigration = read('supabase/migrations/20260923193808_create_private_testing_schema_and_fixture_harness.sql')
const store = read('lib/agents/learning-experiment-runner-store.ts')
const service = read('lib/agents/learning-experiment-runner-service.ts')
const budgetAdapter = read('lib/ai/governance-learning-experiment-budget.ts')
const localFixture = read('scripts/run-learning-experiment-runner-fixture.sh')

test('runner SQL and application adapters remain pinned to canonical agent schema', () => {
  for (const sql of [runnerMigration, budgetMigration]) {
    assert.match(sql, /\b(?:CREATE TABLE|CREATE FUNCTION)\s+agent\./i)
    assert.doesNotMatch(sql, /\b(?:CREATE TABLE|CREATE FUNCTION)\s+testing\./i)
  }
  for (const source of [store, service, budgetAdapter]) {
    assert.match(source, /\.schema\('agent'\)/)
    assert.doesNotMatch(source, /\.schema\('testing'\)/)
  }
})

test('testing schema remains a private synthetic fixture harness, not a runner mirror', () => {
  assert.match(testingMigration, /CREATE SCHEMA IF NOT EXISTS testing/i)
  assert.match(testingMigration, /synthetic boolean NOT NULL DEFAULT true CHECK \(synthetic\)/i)
  const createdTestingTables = [...testingMigration.matchAll(/CREATE TABLE IF NOT EXISTS testing\.([\w]+)/gi)].map((m) => m[1])
  assert.deepEqual(createdTestingTables.sort(), ['fixture_assertions', 'fixture_runs'])
  assert.doesNotMatch(testingMigration, /learning_experiment|learning_candidates|learning_evaluation_policies/i)
})

test('exact runner SQL fixture refuses shared or remote PostgreSQL targets', () => {
  assert.match(localFixture, /PGHOST:-\}/)
  assert.match(localFixture, /127\.0\.0\.1\|localhost\|::1/)
  assert.match(localFixture, /PGHOST must identify an isolated local PostgreSQL fixture/)
  assert.match(localFixture, /PGDATABASE must identify a disposable database/)
})
