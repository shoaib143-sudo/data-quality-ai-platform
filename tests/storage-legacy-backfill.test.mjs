import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(
  new URL('../supabase/migrations/20260917002000_backfill_legacy_supabase_storage_registry.sql', import.meta.url),
  'utf8',
)

test('legacy storage backfill is scoped, idempotent, and verification-safe', () => {
  assert.match(migration, /from storage\.objects o/)
  assert.match(migration, /join app\.projects p/)
  assert.match(migration, /o\.bucket_id = 'dataset-files'/)
  assert.match(migration, /projects\//)
  assert.match(migration, /'supabase'/)
  assert.match(migration, /'LEGACY_UPLOAD'/)
  assert.match(migration, /'UPLOADED'/)
  assert.match(migration, /requires_verification/)
  assert.match(migration, /on conflict \(provider, bucket, object_key\) do nothing/)
  assert.doesNotMatch(migration, /'READY'/)
  assert.doesNotMatch(migration, /verified_at/)
  assert.doesNotMatch(migration, /update\s+storage\.objects/i)
  assert.doesNotMatch(migration, /delete\s+from\s+storage\.objects/i)
})
