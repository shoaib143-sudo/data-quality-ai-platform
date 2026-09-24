import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync('supabase/migrations/20260923193808_create_private_testing_schema_and_fixture_harness.sql', 'utf8')
const smoke = readFileSync('Testing/sql/private-testing-schema-smoke.sql', 'utf8')

test('schema migration is private, synthetic-only and RLS-protected', () => {
  assert.match(migration, /CREATE SCHEMA IF NOT EXISTS testing/i)
  assert.match(migration, /REVOKE ALL ON SCHEMA testing FROM PUBLIC, anon, authenticated/i)
  assert.match(migration, /GRANT USAGE ON SCHEMA testing TO service_role/i)
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON[\s\S]+?TO service_role/i)
  assert.match(migration, /synthetic boolean NOT NULL DEFAULT true CHECK \(synthetic\)/i)
  for (const table of ['fixture_runs', 'fixture_assertions']) {
    assert.match(migration, new RegExp('CREATE TABLE IF NOT EXISTS testing\\.' + table, 'i'))
    assert.match(migration, new RegExp('ALTER TABLE testing\\.' + table + ' ENABLE ROW LEVEL SECURITY', 'i'))
  }
  assert.doesNotMatch(migration, /GRANT\s+(?:ALL|USAGE|SELECT|INSERT|UPDATE|DELETE)\s+ON\s+(?:SCHEMA\s+)?testing\b[^;]*\bTO\s+(?:anon|authenticated)\b/i)
})

test('live smoke uses only synthetic testing tables and always rolls back', () => {
  assert.match(smoke, /^BEGIN;/m)
  assert.match(smoke, /ROLLBACK;\s*$/)
  assert.doesNotMatch(smoke, /\bCOMMIT\s*;/i)
  assert.doesNotMatch(smoke, /\b(?:TRUNCATE|DROP|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE)\b/i)
  const inserted = [...smoke.matchAll(/\bINSERT\s+INTO\s+([\w.]+)/ig)].map(match => match[1])
  assert.ok(inserted.length >= 5)
  assert.ok(inserted.every(table => /^testing\.(fixture_runs|fixture_assertions)$/.test(table)), inserted.join(', '))
  assert.match(smoke, /non_synthetic/)
  assert.match(smoke, /invalid_mode/)
  assert.match(smoke, /DUPLICATE_ASSERTION_ACCEPTED/)
  assert.match(smoke, /INVALID_ASSERTION_RESULT_ACCEPTED/)
  assert.match(smoke, /ORPHAN_ASSERTION_ACCEPTED/)
  assert.match(smoke, /has_schema_privilege\('anon', 'testing', 'USAGE'\)/)
  for (const mode of ['OFF','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS']) {
    assert.ok(smoke.includes(mode), mode)
  }
})

test('neither harness can assert canonical governance E2E certification', () => {
  assert.match(migration, /not canonical governance orchestration or certification records/i)
  assert.match(smoke, /not_e2e_certification/)
  assert.doesNotMatch(smoke, /\bINSERT\s+INTO\s+(?:governance|catalog|profiling|agent)\./i)
})
