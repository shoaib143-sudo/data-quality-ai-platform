import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'

const script = 'scripts/verify-data-plane-config.mjs'

function run(overrides = {}) {
  const env = {
    ...process.env,
    KNOWLEDGE_SEARCH_PROVIDER: 'postgres',
    GRAPH_PROVIDER: 'postgres',
    ANALYTICS_PROVIDER: 'postgres',
    OBJECT_STORE_PROVIDER: 'supabase',
    DATANEXUS_ENV: 'development',
    STORAGE_R2_PRODUCTION_CUTOVER_APPROVED: '',
    R2_ACCOUNT_ID: '',
    R2_ACCESS_KEY_ID: '',
    R2_SECRET_ACCESS_KEY: '',
    R2_BUCKET: '',
    R2_ENDPOINT: '',
    R2_PREFIX: '',
    ...overrides,
  }
  return spawnSync(process.execPath, [script], { env, encoding: 'utf8' })
}

test('Supabase remains the safe default object store', () => {
  const result = run()
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.selection.objectStore, 'supabase')
})

test('R2 is accepted when complete non-production configuration is present', () => {
  const result = run({
    OBJECT_STORE_PROVIDER: 'r2',
    R2_ACCOUNT_ID: 'example-account',
    R2_ACCESS_KEY_ID: 'access',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'datanexus-r2',
    R2_ENDPOINT: 'https://example-account.r2.cloudflarestorage.com',
    R2_PREFIX: 'datanexus',
  })
  assert.equal(result.status, 0, result.stderr)
  const output = JSON.parse(result.stdout)
  assert.equal(output.selection.objectStore, 'r2')
})

test('R2 fails closed when required configuration is incomplete', () => {
  const result = run({ OBJECT_STORE_PROVIDER: 'r2' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /R2_ACCOUNT_ID is required/)
})

test('R2 rejects an endpoint from another account', () => {
  const result = run({
    OBJECT_STORE_PROVIDER: 'r2',
    R2_ACCOUNT_ID: 'account-a',
    R2_ACCESS_KEY_ID: 'access',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'datanexus-r2',
    R2_ENDPOINT: 'https://account-b.r2.cloudflarestorage.com',
    R2_PREFIX: 'datanexus',
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /R2_ENDPOINT must match/)
})

test('production R2 selection requires explicit cutover approval', () => {
  const result = run({
    OBJECT_STORE_PROVIDER: 'r2',
    DATANEXUS_ENV: 'production',
    R2_ACCOUNT_ID: 'example-account',
    R2_ACCESS_KEY_ID: 'access',
    R2_SECRET_ACCESS_KEY: 'secret',
    R2_BUCKET: 'datanexus-r2',
    R2_ENDPOINT: 'https://example-account.r2.cloudflarestorage.com',
    R2_PREFIX: 'datanexus',
  })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /STORAGE_R2_PRODUCTION_CUTOVER_APPROVED=true/)
})

test('legacy generic s3 selection is rejected instead of bypassing governed R2 configuration', () => {
  const result = run({ OBJECT_STORE_PROVIDER: 's3' })
  assert.notEqual(result.status, 0)
  assert.match(result.stderr, /OBJECT_STORE_PROVIDER must be one of: supabase, r2/)
})
