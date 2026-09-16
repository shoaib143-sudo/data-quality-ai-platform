import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const uploadRoute = fs.readFileSync(new URL('../app/api/datasets/source/upload-file/route.ts', import.meta.url), 'utf8')

test('upload cleanup requires a registered storage object', () => {
  assert.match(uploadRoute, /Registered upload object not found/)
  assert.match(uploadRoute, /from\('storage_objects'\)/)
  assert.match(uploadRoute, /\.eq\('object_key', key\)/)
})

test('upload cleanup cannot remove READY or dataset-version referenced objects', () => {
  assert.match(uploadRoute, /READY dataset sources cannot be removed through upload cleanup/)
  assert.match(uploadRoute, /from\('dataset_versions'\)/)
  assert.match(uploadRoute, /\.eq\('storage_object_id', registryObject\.id\)/)
  assert.match(uploadRoute, /referenced by a dataset version/)
})

test('upload cleanup is idempotent after deletion and records tombstone metadata', () => {
  assert.match(uploadRoute, /registryObject\.state === 'DELETED'/)
  assert.match(uploadRoute, /idempotent: true/)
  assert.match(uploadRoute, /state: 'DELETED'/)
  assert.match(uploadRoute, /deleted_at: now/)
})
