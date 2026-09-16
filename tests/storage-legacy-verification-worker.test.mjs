import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(
  new URL('../app/api/internal/storage/verify-uploaded/route.ts', import.meta.url),
  'utf8',
)

test('legacy verification worker is internally authorized and bounded', () => {
  assert.match(route, /requireInternalBearer\(request\)/)
  assert.match(route, /CRON_SECRET/)
  assert.match(route, /STORAGE_VERIFY_BATCH_SIZE/)
  assert.match(route, /MAX_BATCH = 100/)
  assert.match(route, /\.eq\('state', 'UPLOADED'\)/)
  assert.match(route, /\.eq\('owner_type', 'LEGACY_UPLOAD'\)/)
})

test('legacy verification worker fails closed before READY', () => {
  assert.match(route, /headObject/)
  assert.match(route, /MISSING_OBJECT/)
  assert.match(route, /SIZE_UNVERIFIABLE/)
  assert.match(route, /SIZE_MISMATCH/)
  assert.match(route, /CONTENT_TYPE_UNVERIFIABLE/)
  assert.match(route, /CONTENT_TYPE_MISMATCH/)
  assert.match(route, /state: 'FAILED'/)
  assert.match(route, /state: 'QUARANTINED'/)
  assert.match(route, /state: 'READY'/)
  assert.match(route, /verified_at: now/)
  assert.match(route, /requires_verification: false/)
})

test('legacy verification worker is non-destructive and race constrained', () => {
  assert.match(route, /destructiveActions: 0/)
  assert.match(route, /\.eq\('state', 'UPLOADED'\)/)
  assert.doesNotMatch(route, /deleteObject/)
  assert.doesNotMatch(route, /\.delete\(/)
  assert.doesNotMatch(route, /createUploadAuthorization/)
  assert.doesNotMatch(route, /createDownloadAuthorization/)
})
