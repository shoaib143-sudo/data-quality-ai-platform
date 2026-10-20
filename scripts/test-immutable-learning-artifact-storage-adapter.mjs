import assert from 'node:assert/strict'
import { createSupabaseImmutableLearningArtifactBackend } from '../lib/agents/immutable-learning-artifact-storage-adapter.ts'

const key = 'learning/10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/candidate/v1/abc'
const objects = new Map()
const uploadOptions = []
let nextUploadError = null
let nextDownloadError = null
const client = {
  storage: {
    from(bucket) {
      assert.equal(bucket, 'test-learning-artifacts')
      return {
        async upload(path, bytes, options) {
          assert.ok(path.startsWith('learning/'))
          uploadOptions.push(options)
          if (nextUploadError) {
            const error = nextUploadError
            nextUploadError = null
            return { error }
          }
          if (objects.has(path)) return { error: { statusCode: '400', error: 'Duplicate', message: 'Asset Already Exists' } }
          objects.set(path, Uint8Array.from(bytes))
          return { error: null }
        },
        async download(path) {
          if (nextDownloadError) {
            const error = nextDownloadError
            nextDownloadError = null
            return { data: null, error }
          }
          const stored = objects.get(path)
          return { data: stored ? new Blob([stored]) : null, error: stored ? null : { statusCode: '404', message: 'Not found' } }
        },
      }
    },
  },
}

const backend = createSupabaseImmutableLearningArtifactBackend(client, 'test-learning-artifacts')
const bytes = new TextEncoder().encode('immutable bytes')
assert.equal(await backend.putIfAbsent({ key, bytes, contentType: 'text/plain' }), true)
assert.deepEqual(uploadOptions[0], { contentType: 'text/plain', upsert: false })
assert.equal(await backend.putIfAbsent({ key, bytes, contentType: 'text/plain' }), false)
assert.deepEqual(new TextDecoder().decode(await backend.get(key)), 'immutable bytes')
assert.equal(await backend.get(`${key}-missing`), null)

nextUploadError = { statusCode: '503', message: 'storage unavailable' }
await assert.rejects(backend.putIfAbsent({ key: `${key}-unavailable`, bytes, contentType: 'text/plain' }), /STORAGE_WRITE_FAILED/)
nextDownloadError = { statusCode: '503', message: 'storage unavailable' }
await assert.rejects(backend.get(key), /STORAGE_READ_FAILED/)
await assert.rejects(backend.get('../escape'), /KEY_INVALID/)
assert.throws(() => createSupabaseImmutableLearningArtifactBackend(client, '../escape'), /BUCKET_INVALID/)

console.log('PASS Supabase learning artifact adapter requests create-only writes, maps duplicate/missing objects, and fails closed on storage errors and invalid scope.')
console.log('NOTE This test uses a synthetic Supabase Storage client. It does not verify a live bucket or provider behavior.')
