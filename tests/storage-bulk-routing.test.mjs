import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const factory = fs.readFileSync(new URL('../lib/storage/factory.ts', import.meta.url), 'utf8')
const upload = fs.readFileSync(new URL('../app/api/datasets/source/upload-file/route.ts', import.meta.url), 'utf8')

test('bulk storage routing is independently configurable without changing the default provider', () => {
  assert.match(factory, /STORAGE_BULK_PROVIDER/)
  assert.match(factory, /export function bulkStorageProvider/)
  assert.match(factory, /const fallback = defaultStorageProvider\(\)/)
  assert.match(factory, /STORAGE_DEFAULT_PROVIDER/)
})

test('production R2 bulk routing has a separate explicit approval gate', () => {
  assert.match(factory, /STORAGE_R2_BULK_UPLOADS_APPROVED/)
  assert.match(factory, /isProductionEnvironment\(\)/)
  assert.match(factory, /Production R2 bulk uploads require/)
  assert.match(factory, /productionR2CutoverApproved\(\)/)
})

test('large dataset uploads choose the governed bulk provider while normal uploads keep the default', () => {
  assert.match(upload, /const defaultProvider = defaultStorageProvider\(\)/)
  assert.match(upload, /size > R2_MULTIPART_THRESHOLD_BYTES \? bulkStorageProvider\(\) : defaultProvider/)
  assert.match(upload, /R2_MULTIPART_THRESHOLD_BYTES = 100 \* 1024 \* 1024/)
})

test('bulk routing never exposes the approval gate to the browser', () => {
  assert.doesNotMatch(upload, /STORAGE_R2_BULK_UPLOADS_APPROVED/)
  assert.doesNotMatch(upload, /NEXT_PUBLIC_R2_/)
})
