import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const factory = fs.readFileSync(new URL('../lib/storage/factory.ts', import.meta.url), 'utf8')
const runtime = fs.readFileSync(new URL('../scripts/verify-r2-runtime.mjs', import.meta.url), 'utf8')

test('production cannot select R2 without explicit cutover approval', () => {
  assert.match(factory, /value === 'r2'/)
  assert.match(factory, /isProductionEnvironment\(\)/)
  assert.doesNotMatch(factory, /VERCEL_ENV/)
  assert.match(factory, /STORAGE_R2_PRODUCTION_CUTOVER_APPROVED/)
  assert.match(factory, /Production R2 storage cutover requires/)
})

test('runtime verification requires exact account-scoped R2 endpoint', () => {
  assert.match(runtime, /expectedHost = `\$\{process\.env\.R2_ACCOUNT_ID\}\.r2\.cloudflarestorage\.com`/)
  assert.match(runtime, /endpoint\.hostname !== expectedHost/)
  assert.doesNotMatch(runtime, /endpoint\.hostname\.endsWith/)
})

test('runtime verification independently blocks unapproved provider-neutral production R2 default', () => {
  assert.match(runtime, /DATANEXUS_ENV/)
  assert.match(runtime, /environment === 'production'/)
  assert.match(runtime, /STORAGE_R2_PRODUCTION_CUTOVER_APPROVED/)
  assert.match(runtime, /Production R2 cutover has not been explicitly approved/)
})

test('runtime verification preserves fail-closed Vercel production compatibility while DATANEXUS_ENV is rolled out', () => {
  assert.match(runtime, /VERCEL_ENV/)
  assert.match(runtime, /return process\.env\.VERCEL_ENV/)
})
