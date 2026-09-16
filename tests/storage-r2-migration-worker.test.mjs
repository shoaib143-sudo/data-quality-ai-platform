import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/internal/storage/migrate-to-r2/route.ts', import.meta.url), 'utf8')

test('R2 migration worker is internally authorized, bounded, and source-safe', () => {
  assert.match(route, /requireInternalBearer\(request\)/)
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /STORAGE_MIGRATION_BATCH_SIZE/)
  assert.match(route, /MAX_BATCH = 20/)
  assert.match(route, /STORAGE_MIGRATION_MAX_OBJECT_BYTES/)
  assert.match(route, /HARD_MAX_OBJECT_BYTES/)
  assert.match(route, /\.eq\('provider', 'supabase'\)/)
  assert.match(route, /\.eq\('state', 'READY'\)/)
  assert.match(route, /sourceObjectsDeleted: 0/)
  assert.match(route, /datasetVersionReferencesChanged: 0/)
  assert.doesNotMatch(route, /sourceStorage\.deleteObject/)
})

test('R2 migration worker creates a distinct provider-neutral migration target', () => {
  assert.match(route, /provider: 'r2'/)
  assert.match(route, /owner_type: 'MIGRATION_COPY'/)
  assert.match(route, /state: 'PENDING'/)
  assert.match(route, /source_storage_object_id/)
  assert.match(route, /source_object_key_hash/)
  assert.match(route, /migrations\/supabase/)
  assert.doesNotMatch(route, /storage_object_id.*update/i)
})

test('R2 migration worker verifies source and target bytes before READY', () => {
  assert.match(route, /sourceStorage\.headObject/)
  assert.match(route, /sourceStorage\.getObject/)
  assert.match(route, /targetStorage\.putObject/)
  assert.match(route, /targetStorage\.headObject/)
  assert.match(route, /targetChecksum/)
  assert.match(route, /sha256/)
  assert.match(route, /QUARANTINED/)
  assert.match(route, /SHA256_MISMATCH/)
  assert.match(route, /state: 'READY'/)
  assert.match(route, /verified_at: verifiedAt/)
  assert.match(route, /SOURCE_HEAD_TARGET_HEAD_TARGET_SHA256/)
})

test('R2 migration worker revalidates source metadata and checksum fail closed', () => {
  assert.match(route, /source content type can no longer be observed/)
  assert.match(route, /source content type no longer matches its registry metadata/)
  assert.match(route, /source bytes do not match verified registry checksum/)
  assert.match(route, /SKIPPED_SOURCE_UNSUPPORTED_CHECKSUM/)
  assert.match(route, /source\.checksum_algorithm !== 'sha256'/)
})

test('R2 migration worker is idempotent and never treats an unverified source as migratable', () => {
  assert.match(route, /SKIPPED_ALREADY_READY/)
  assert.match(route, /SKIPPED_SOURCE_NOT_INTEGRITY_READY/)
  assert.match(route, /SKIPPED_OBJECT_TOO_LARGE/)
  assert.match(route, /\.eq\('object_key', persistedKey\)/)
  assert.match(route, /\.eq\('provider', 'r2'\)/)
  assert.match(route, /\.eq\('bucket', r2Bucket\)/)
})
