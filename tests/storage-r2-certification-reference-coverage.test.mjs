import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/internal/storage/certify-r2/route.ts', import.meta.url), 'utf8')

test('R2 certification requires every referenced Supabase object to have a verified migration copy', () => {
  assert.match(route, /verifiedMigrationSourceIds = new Set/)
  assert.match(route, /referencedSupabaseWithoutVerifiedMigration/)
  assert.match(route, /!verifiedMigrationSourceIds\.has\(row\.id\)/)
  assert.match(route, /REFERENCED_SUPABASE_OBJECTS_MISSING_VERIFIED_R2_COPY/)
})

test('R2 certification reports reference-provider coverage for post-cutover verification', () => {
  assert.match(route, /referencedSupabaseObjects/)
  assert.match(route, /referencedR2Objects/)
  assert.match(route, /referencedSupabaseWithoutVerifiedMigration/)
})

test('migration-pair integrity still fails closed independently of reference coverage', () => {
  assert.match(route, /R2_MIGRATION_PAIR_INTEGRITY_INCOMPLETE/)
  assert.match(route, /readyMigrationCopies\.length !== verifiedMigrationPairs/)
})
