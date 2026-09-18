import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const registration = fs.readFileSync(new URL('../app/api/datasets/source/register/route.ts', import.meta.url), 'utf8')
const discovery = fs.readFileSync(new URL('../app/api/datasets/source/discover-file/route.ts', import.meta.url), 'utf8')
const validation = fs.readFileSync(new URL('../lib/profiling/source-validation.ts', import.meta.url), 'utf8')
const providerNeutral = fs.readFileSync(new URL('../lib/profiling/provider-neutral-file-source.ts', import.meta.url), 'utf8')

test('provider-neutral FILE parsing accepts R2, Supabase, and storage URI schemes', () => {
  assert.match(providerNeutral, /\^\(r2\|supabase\|storage\):\\\/\\\//)
  assert.match(providerNeutral, /match\[1\]\.toLowerCase\(\) === 'r2' \? 'r2' : 'supabase'/)
  assert.match(providerNeutral, /storage:\/\//)
  assert.match(providerNeutral, /r2:\/\//)
})

test('provider-neutral object storage URIs are project scoped for both providers', () => {
  assert.match(providerNeutral, /assertProjectScopedObjectStorageSource/)
  assert.match(providerNeutral, /process\.env\.R2_BUCKET/)
  assert.match(providerNeutral, /process\.env\.R2_PREFIX/)
  assert.match(providerNeutral, /parsed\.bucket !== 'dataset-files'/)
  assert.match(providerNeutral, /projectPath\.startsWith\(requiredPrefix\)/)
})

test('FILE source registration reuses governed provider-neutral parsing', () => {
  assert.match(registration, /parseObjectStorageSourceUri/)
  assert.match(registration, /assertProjectScopedObjectStorageSource/)
  assert.match(registration, /storage_provider: parsed\.provider/)
  assert.match(registration, /storage_bucket: parsed\.bucket/)
  assert.match(registration, /storage_path: parsed\.key/)
})

test('FILE discovery resolves provider-neutral sources before loading bytes', () => {
  assert.match(discovery, /parseObjectStorageSourceUri/)
  assert.match(discovery, /assertProjectScopedObjectStorageSource/)
  assert.match(discovery, /resolveProviderNeutralFileConfig/)
  assert.match(discovery, /sanitizeProviderNeutralFileResult/)
})

test('source validation rejects cross-project object-storage references before connectivity', () => {
  assert.match(validation, /parseObjectStorageSourceUri/)
  assert.match(validation, /assertProjectScopedObjectStorageSource/)
  assert.match(validation, /FILE source is outside the authorized project storage scope/)
})

test('Supabase provider URIs are converted to executable bucket and path config', () => {
  assert.match(providerNeutral, /objectStorage\.provider === 'supabase'/)
  assert.match(providerNeutral, /bucket: objectStorage\.bucket/)
  assert.match(providerNeutral, /path: objectStorage\.key/)
  assert.match(providerNeutral, /storage_provider: 'supabase'/)
})
