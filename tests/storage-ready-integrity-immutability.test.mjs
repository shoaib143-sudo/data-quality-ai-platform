import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(new URL('../supabase/migrations/20260917004000_enforce_ready_storage_integrity_immutability.sql', import.meta.url), 'utf8')

test('storage identity remains immutable and deleted objects cannot resurrect', () => {
  assert.match(migration, /project_id is distinct from old\.project_id/)
  assert.match(migration, /provider is distinct from old\.provider/)
  assert.match(migration, /bucket is distinct from old\.bucket/)
  assert.match(migration, /object_key is distinct from old\.object_key/)
  assert.match(migration, /old\.state = 'DELETED'/)
})

test('READY size and content type are immutable', () => {
  assert.match(migration, /old\.state = 'READY' and new\.state = 'READY'/)
  assert.match(migration, /new\.size_bytes is distinct from old\.size_bytes/)
  assert.match(migration, /new\.content_type is distinct from old\.content_type/)
})

test('READY checksum may only be enriched once with SHA-256', () => {
  assert.match(migration, /old\.checksum is not null/)
  assert.match(migration, /checksum is immutable once established/)
  assert.match(migration, /old\.checksum is null and new\.checksum is not null/)
  assert.match(migration, /new\.checksum_algorithm <> 'sha256'/)
  assert.match(migration, /checksum algorithm cannot change without a checksum/)
})

test('READY verification timestamp cannot be cleared and function remains hardened', () => {
  assert.match(migration, /new\.verified_at is null/)
  assert.match(migration, /security definer/)
  assert.match(migration, /set search_path = pg_catalog, catalog/)
  assert.match(migration, /revoke all on function catalog\.enforce_storage_object_lifecycle_invariants\(\) from public/)
})
