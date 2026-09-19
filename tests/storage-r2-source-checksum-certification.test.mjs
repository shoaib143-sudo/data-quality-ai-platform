import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/internal/storage/certify-r2/route.ts', import.meta.url), 'utf8')
const migration = fs.readFileSync(new URL('../supabase/migrations/20260919134122_require_r2_migration_source_sha256.sql', import.meta.url), 'utf8')

test('R2 certification requires source and target SHA-256 parity', () => {
  assert.match(route, /source\.checksum_algorithm === 'sha256'/)
  assert.match(route, /Boolean\(source\.checksum\)/)
  assert.match(route, /source\.checksum === target\.checksum/)
  assert.doesNotMatch(route, /!source\.checksum \|\| source\.checksum_algorithm !== 'sha256'/)
})

test('database invariant requires SHA-256-backed source before a migration copy becomes READY', () => {
  assert.match(migration, /source_row\.checksum_algorithm <> 'sha256' or source_row\.checksum is null/)
  assert.match(migration, /READY MIGRATION_COPY requires a SHA-256-backed READY source object/)
  assert.match(migration, /source_row\.checksum <> new\.checksum/)
  assert.match(migration, /READY MIGRATION_COPY checksum must match source checksum/)
  assert.match(migration, /revoke all on function catalog\.enforce_r2_migration_copy_invariants\(\) from public/)
  assert.match(migration, /set search_path = pg_catalog, catalog/)
})
