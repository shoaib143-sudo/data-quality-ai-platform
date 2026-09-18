import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../lib/profiling/file-profile.ts', import.meta.url), 'utf8')

test('FILE profiling treats dataset version storage_object_id as authoritative when present', () => {
  assert.match(source, /storage_object_id/)
  assert.match(source, /from\('storage_objects'\)/)
  assert.match(source, /Governed FILE storage object was not found/)
  assert.match(source, /storageObject\.state !== 'READY'/)
})

test('FILE profiling resolves R2 and Supabase references from the governed storage object', () => {
  assert.match(source, /storageObject\.provider === 'r2'/)
  assert.match(source, /r2:\/\//)
  assert.match(source, /storage:\/\//)
  assert.match(source, /storage_provider: storageObject\.provider/)
  assert.match(source, /storage_bucket: storageObject\.bucket/)
  assert.match(source, /storage_path: storageObject\.object_key/)
})

test('FILE profiling fails closed on unsupported governed storage providers', () => {
  assert.match(source, /storageObject\.provider !== 'supabase' && storageObject\.provider !== 'r2'/)
  assert.match(source, /Unsupported governed FILE storage provider/)
})


test('governed FILE storage reference strips stale URL fields before source loading', () => {
  assert.match(source, /delete governedExecutionConfig\.url/)
  assert.match(source, /delete governedExecutionConfig\.source_url/)
  assert.match(source, /delete governedExecutionConfig\.sourceUrl/)
  assert.match(source, /\.\.\.governedExecutionConfig/)
})

// Exact-SHA preview retrigger: runtime storage cutover coverage remains deterministic.
