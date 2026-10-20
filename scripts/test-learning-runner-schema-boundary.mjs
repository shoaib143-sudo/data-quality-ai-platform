import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(path, 'utf8')
const runnerMigration = read('supabase/migrations/20261001152250_learning_experiment_runner_evidence.sql')
const budgetMigration = read('supabase/migrations/20261001004136_governed_learning_experiment_budget.sql')
const testingMigration = read('supabase/migrations/20260923193808_create_private_testing_schema_and_fixture_harness.sql')
const store = read('lib/agents/learning-experiment-runner-store.ts')
const service = read('lib/agents/learning-experiment-runner-service.ts')
const budgetAdapter = read('lib/ai/governance-learning-experiment-budget.ts')
const fixtureScripts = [
  'scripts/run-learning-experiment-runner-fixture.sh',
  'scripts/run-learning-experiment-budget-fixture.sh',
]
const fixtureSources = fixtureScripts.map(read)
const workflow = read('.github/workflows/continuous-learning-governance.yml')

test('runner SQL and application adapters remain pinned to canonical agent schema', () => {
  for (const sql of [runnerMigration, budgetMigration]) {
    assert.match(sql, /\b(?:CREATE TABLE|CREATE FUNCTION)\s+agent\./i)
    assert.doesNotMatch(sql, /\b(?:CREATE TABLE|CREATE FUNCTION)\s+testing\./i)
  }
  for (const source of [store, service, budgetAdapter]) {
    assert.match(source, /\.schema\('agent'\)/)
    assert.doesNotMatch(source, /\.schema\('testing'\)/)
  }
  const uncommentedMigrations = [runnerMigration, budgetMigration].map((sql) =>
    sql.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*--.*$/gm, ''),
  )
  for (const sql of uncommentedMigrations) {
    assert.doesNotMatch(sql, /\btesting\s*\./i, 'runner migrations must not reference the synthetic testing schema')
  }
})

test('testing schema remains a private synthetic fixture harness, not a runner mirror', () => {
  assert.match(testingMigration, /CREATE SCHEMA IF NOT EXISTS testing/i)
  assert.match(testingMigration, /synthetic boolean NOT NULL DEFAULT true CHECK \(synthetic\)/i)
  const createdTestingTables = [...testingMigration.matchAll(/CREATE TABLE IF NOT EXISTS testing\.([\w]+)/gi)].map((m) => m[1])
  assert.deepEqual(createdTestingTables.sort(), ['fixture_assertions', 'fixture_runs'])
  assert.doesNotMatch(testingMigration, /learning_experiment|learning_candidates|learning_evaluation_policies/i)
})

test('destructive database fixtures require explicit opt-in and a dedicated database name', () => {
  for (const source of fixtureSources) {
    assert.match(source, /PGHOST:-\}/)
    assert.match(source, /127\.0\.0\.1\|localhost\|::1/)
    assert.match(source, /DATANEXUS_DISPOSABLE_FIXTURE_CONFIRM/)
    assert.match(source, /I_ACCEPT_DESTRUCTIVE_FIXTURE/)
    assert.match(source, /datanexus_fixture_\*/)
  }

  for (const script of fixtureScripts) {
    const rejected = spawnSync('bash', [script], {
      encoding: 'utf8',
      env: {
        PATH: process.env.PATH,
        PGHOST: '127.0.0.1',
        PGDATABASE: 'datanexus_fixture_negative_test',
        PGUSER: 'postgres',
      },
    })
    assert.notEqual(rejected.status, 0)
    assert.match(rejected.stderr, /DATANEXUS_DISPOSABLE_FIXTURE_CONFIRM/)
  }
})

test('testing schema migration changes trigger the continuous learning boundary check', () => {
  const path = 'supabase/migrations/20260923193808_create_private_testing_schema_and_fixture_harness.sql'
  assert.equal(workflow.split(path).length - 1, 2, 'path must appear in both pull_request and push filters')
})
