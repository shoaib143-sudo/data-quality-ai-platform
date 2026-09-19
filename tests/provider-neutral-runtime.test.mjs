import test from 'node:test'
import assert from 'node:assert/strict'
import {
  dataNexusEnvironment,
  dataNexusPlatform,
  deploymentBuildTimestamp,
  deploymentCommitSha,
} from '../lib/runtime/environment.ts'

test('DATANEXUS_ENV is authoritative for production, canary, and development', () => {
  assert.equal(dataNexusEnvironment({ DATANEXUS_ENV: 'production' }), 'production')
  assert.equal(dataNexusEnvironment({ DATANEXUS_ENV: 'canary', VERCEL_ENV: 'production' }), 'canary')
  assert.equal(dataNexusEnvironment({ DATANEXUS_ENV: 'development' }), 'development')
})

test('legacy Vercel production detection remains fail-closed during migration', () => {
  assert.equal(dataNexusEnvironment({ VERCEL_ENV: 'production' }), 'production')
  assert.equal(dataNexusEnvironment({ VERCEL_ENV: 'preview' }), 'development')
})

test('invalid provider-neutral environments fail closed', () => {
  assert.throws(() => dataNexusEnvironment({ DATANEXUS_ENV: 'prod' }), /Unsupported DATANEXUS_ENV/)
})

test('deployment platform is explicit on Cloudflare and auto-detected on Vercel', () => {
  assert.equal(dataNexusPlatform({ DATANEXUS_PLATFORM: 'cloudflare' }), 'cloudflare')
  assert.equal(dataNexusPlatform({ VERCEL: '1' }), 'vercel')
  assert.equal(dataNexusPlatform({}), 'local')
})

test('build identity only accepts immutable full git SHAs', () => {
  assert.equal(deploymentCommitSha({ DATANEXUS_COMMIT_SHA: 'A'.repeat(40) }), 'a'.repeat(40))
  assert.equal(deploymentCommitSha({ DATANEXUS_COMMIT_SHA: 'main' }), null)
})

test('build timestamp rejects malformed values', () => {
  assert.equal(deploymentBuildTimestamp({ DATANEXUS_BUILD_TIMESTAMP: 'not-a-date' }), null)
  assert.equal(deploymentBuildTimestamp({ DATANEXUS_BUILD_TIMESTAMP: '2026-09-19T03:00:00Z' }), '2026-09-19T03:00:00.000Z')
})
