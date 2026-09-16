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
  assert.match(contracts, /requiredHeaders\?: Record<string, string>/)
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

test('R2 credentials remain server-side only', () => {
  assert.doesNotMatch(r2, /NEXT_PUBLIC_R2_/)
  assert.match(r2, /R2_ACCESS_KEY_ID/)
  assert.match(r2, /R2_SECRET_ACCESS_KEY/)
})

test('R2 adapter fails closed on wrong bucket, provider, prefix and endpoint', () => {
  assert.match(r2, /R2 bucket is outside the configured application scope/)
  assert.match(r2, /R2 adapter received a non-R2 storage reference/)
  assert.match(r2, /R2 object key is outside the configured application prefix/)
  assert.match(r2, /R2_ENDPOINT does not match the configured R2 account/)
})

test('R2 signed uploads bind content type and enforce expiry limits', () => {
  assert.match(r2, /content-type/)
  assert.match(r2, /requiredHeaders/)
  assert.match(r2, /expiresInSeconds < 1 \|\| expiresInSeconds > 604800/)
})

test('R2 object keys reject traversal and malformed segments', () => {
  assert.match(r2, /part === '\.' \|\| part === '\.\.'/)
  assert.match(r2, /R2 object key is invalid/)
})

test('server-side R2 writes reject unsupported body types rather than hashing an empty payload', () => {
  assert.match(r2, /Unsupported R2 server-side request body type/)
  assert.doesNotMatch(r2, /const payload = typeof body === 'string' \|\| Buffer\.isBuffer\(body\) \? body : ''/)
})

test('upload cleanup never trusts a client-supplied bucket', () => {
  assert.doesNotMatch(uploadRoute, /body\.bucket/)
  assert.match(uploadRoute, /const bucket = datasetBucket\(requestedProvider\)/)
})

test('upload endpoint rejects empty, oversized, and unsupported files', () => {
  assert.match(uploadRoute, /size <= 0/)
  assert.match(uploadRoute, /status: 413/)
  assert.match(uploadRoute, /status: 415/)
})

test('R2 upload response tells clients which signed headers must be sent', () => {
  assert.match(uploadRoute, /uploadHeaders: authorization\.requiredHeaders/)
})
