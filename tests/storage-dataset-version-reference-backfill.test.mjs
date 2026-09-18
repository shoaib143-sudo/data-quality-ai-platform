import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260918040000_backfill_dataset_version_storage_references.sql', import.meta.url),
  'utf8',
)

test('dataset version storage backfill is project scoped and READY only', () => {
  assert.match(migration, /join catalog\.datasets d/)
  assert.match(migration, /so\.project_id = d\.project_id/)
  assert.match(migration, /so\.provider = 'supabase'/)
  assert.match(migration, /so\.owner_type = 'DATASET_VERSION'/)
  assert.match(migration, /so\.state = 'READY'/)
})

test('dataset version storage backfill accepts only exact legacy or canonical object URIs', () => {
  assert.match(migration, /dv\.source_uri = so\.bucket \|\| '\/' \|\| so\.object_key/)
  assert.match(migration, /dv\.source_uri = 'storage:\/\/' \|\| so\.bucket \|\| '\/' \|\| so\.object_key/)
  assert.doesNotMatch(migration, /like|ilike/i)
})

test('dataset version storage backfill is idempotent and non-destructive', () => {
  assert.match(migration, /dv\.storage_object_id is null/)
  assert.match(migration, /storage_reference_backfilled/)
  assert.doesNotMatch(migration, /delete\s+from/i)
  assert.doesNotMatch(migration, /drop\s+/i)
})
