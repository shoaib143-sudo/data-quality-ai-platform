import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const contracts = fs.readFileSync(new URL('../lib/storage/contracts.ts', import.meta.url), 'utf8')
const r2 = fs.readFileSync(new URL('../lib/storage/r2.ts', import.meta.url), 'utf8')
const supabase = fs.readFileSync(new URL('../lib/storage/supabase.ts', import.meta.url), 'utf8')
const factory = fs.readFileSync(new URL('../lib/storage/factory.ts', import.meta.url), 'utf8')
const uploadRoute = fs.readFileSync(new URL('../app/api/datasets/source/upload-file/route.ts', import.meta.url), 'utf8')

test('storage contract exposes required provider-neutral operations', () => {
  for (const operation of ['putObject', 'getObject', 'headObject', 'deleteObject', 'exists', 'createUploadAuthorization', 'createDownloadAuthorization']) {
    assert.match(contracts, new RegExp(`\\b${operation}\\b`))
  }
})

test('both providers implement the same storage abstraction', () => {
  assert.match(r2, /implements ObjectStorage/)
  assert.match(supabase, /implements ObjectStorage/)
  assert.match(factory, /new R2StorageAdapter\(\)/)
  assert.match(factory, /new SupabaseStorageAdapter\(\)/)
})

test('provider defaults to Supabase until explicit cutover', () => {
  assert.match(factory, /STORAGE_DEFAULT_PROVIDER \?\? 'supabase'/)
})

test('dataset upload route no longer calls Supabase Storage directly', () => {
  assert.doesNotMatch(uploadRoute, /admin\.storage\.from/)
  assert.match(uploadRoute, /createObjectStorage/)
  assert.match(uploadRoute, /defaultStorageProvider/)
})

test('R2 credentials are server-side only', () => {
  assert.doesNotMatch(r2, /NEXT_PUBLIC_R2_/)
  assert.match(r2, /R2_ACCESS_KEY_ID/)
  assert.match(r2, /R2_SECRET_ACCESS_KEY/)
})
