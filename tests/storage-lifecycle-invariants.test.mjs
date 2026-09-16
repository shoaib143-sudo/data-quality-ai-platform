import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(new URL('../supabase/migrations/20260917004500_enforce_storage_object_lifecycle_invariants.sql', import.meta.url), 'utf8')

test('storage object identity cannot be retargeted after creation', () => {
  for (const field of ['project_id', 'provider', 'bucket', 'object_key']) {
    assert.match(migration, new RegExp(`new\\.${field} is distinct from old\\.${field}`))
  }
  assert.match(migration, /Storage object identity fields are immutable after creation/)
})

test('deleted storage objects cannot be resurrected in place', () => {
  assert.match(migration, /old\.state = 'DELETED' and new\.state <> 'DELETED'/)
  assert.match(migration, /Deleted storage objects cannot be restored in place/)
})

test('referenced READY objects cannot leave READY state', () => {
  assert.match(migration, /old\.state = 'READY' and new\.state <> 'READY'/)
  assert.match(migration, /from catalog\.dataset_versions dv/)
  assert.match(migration, /dv\.storage_object_id = old\.id/)
  assert.match(migration, /Referenced READY storage objects cannot leave READY state/)
})

test('lifecycle invariant function is hardened and trigger-backed', () => {
  assert.match(migration, /security definer/)
  assert.match(migration, /set search_path = pg_catalog, catalog/)
  assert.match(migration, /revoke all on function catalog\.enforce_storage_object_lifecycle_invariants\(\) from public/)
  assert.match(migration, /before update on catalog\.storage_objects/)
})
