import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const route = fs.readFileSync(new URL('../app/api/internal/storage/certify-r2/route.ts', import.meta.url), 'utf8')
const cors = fs.readFileSync(new URL('../lib/storage/r2-cors.ts', import.meta.url), 'utf8')

test('R2 certification is machine-authenticated and non-destructive', () => {
  assert.match(route, /await requireInternalAutomation\\(request\\)/)
  assert.match(route, /destructiveActions: 0/)
  assert.doesNotMatch(route, /\.update\(/)
  assert.doesNotMatch(route, /\.delete\(/)
  assert.doesNotMatch(route, /deleteObject/)
})

test('R2 certification fails closed on runtime, registry, migration, and CORS blockers', () => {
  for (const blocker of [
    'R2_RUNTIME_CONFIGURATION_INCOMPLETE',
    'LEGACY_OBJECTS_AWAITING_VERIFICATION',
    'DATASET_VERSION_REFERENCES_NON_READY_OBJECT',
    'READY_OBJECTS_MISSING_INTEGRITY_METADATA',
    'R2_NON_READY_OBJECTS_PRESENT',
    'NO_READY_R2_MIGRATION_COPY',
    'R2_MIGRATION_PAIR_INTEGRITY_INCOMPLETE',
    'R2_CORS_NOT_CERTIFIED',
  ]) assert.match(route, new RegExp(blocker))
  assert.match(route, /status: preCutoverReady \? 200 : 503/)
})

test('R2 certification requires SHA-256 migration copies paired with READY Supabase sources', () => {
  assert.match(route, /owner_type === 'MIGRATION_COPY'/)
  assert.match(route, /checksum_algorithm === 'sha256'/)
  assert.match(route, /source_storage_object_id/)
  assert.match(route, /source\.provider === 'supabase'/)
  assert.match(route, /source\.state === 'READY'/)
  assert.match(route, /source\.size_bytes/)
})

test('canonical CORS verifier rejects wildcard origins and checks exact desired rules', () => {
  assert.match(cors, /r2CorsHasWildcardOrigin/)
  assert.match(cors, /r2CorsPolicyMatchesDesired/)
  assert.match(cors, /AllowedOrigin/)
  assert.match(cors, /AllowedMethod/)
  assert.match(cors, /AllowedHeader/)
  assert.match(cors, /ExposeHeader/)
  assert.match(cors, /MaxAgeSeconds/)
  assert.match(cors, /if \(r2CorsHasWildcardOrigin\(xml\)\) return false/)
})

test('certification reports only configuration booleans and provider state, never credential values', () => {
  assert.match(route, /r2RuntimeConfigured/)
  assert.doesNotMatch(route, /R2_SECRET_ACCESS_KEY\s*:/)
  assert.doesNotMatch(route, /R2_ACCESS_KEY_ID\s*:/)
  assert.doesNotMatch(route, /R2_ACCOUNT_ID\s*:/)
})
