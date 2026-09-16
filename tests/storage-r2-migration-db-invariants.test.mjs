import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(new URL('../supabase/migrations/20260917003000_enforce_r2_migration_copy_invariants.sql', import.meta.url), 'utf8')

test('migration copies are restricted to R2 with a valid Supabase source', () => {
  assert.match(migration, /new\.owner_type <> 'MIGRATION_COPY'/)
  assert.match(migration, /new\.provider <> 'r2'/)
  assert.match(migration, /source_storage_object_id/)
  assert.match(migration, /source_row\.provider <> 'supabase'/)
  assert.match(migration, /source_row\.project_id <> new\.project_id/)
})

test('READY migration copies require READY source, matching size, and SHA-256', () => {
  assert.match(migration, /new\.state = 'READY'/)
  assert.match(migration, /source_row\.state <> 'READY'/)
  assert.match(migration, /new\.size_bytes <> source_row\.size_bytes/)
  assert.match(migration, /new\.checksum_algorithm <> 'sha256'/)
  assert.match(migration, /source_row\.checksum <> new\.checksum/)
})

test('migration copy trigger is fail-closed and not public executable', () => {
  assert.match(migration, /security definer/)
  assert.match(migration, /set search_path = pg_catalog, catalog/)
  assert.match(migration, /revoke all on function catalog\.enforce_r2_migration_copy_invariants\(\) from public/)
  assert.match(migration, /before insert or update/)
  assert.match(migration, /trg_storage_objects_r2_migration_copy_invariants/)
})
