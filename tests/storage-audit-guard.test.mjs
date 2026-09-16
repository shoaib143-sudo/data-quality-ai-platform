import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const auditRoute = fs.readFileSync(new URL('../app/api/internal/storage/audit/route.ts', import.meta.url), 'utf8')
const internalBearer = fs.readFileSync(new URL('../lib/security/internal-bearer.ts', import.meta.url), 'utf8')

test('storage audit requires hardened internal authorization and is non-destructive', () => {
  assert.match(auditRoute, /requireInternalBearer/)
  assert.match(auditRoute, /Unauthorized/)
  assert.match(internalBearer, /CRON_SECRET/)
  assert.match(internalBearer, /timingSafeEqual/)
  assert.match(auditRoute, /destructiveActions: 0/)
  assert.doesNotMatch(auditRoute, /\.delete\(/)
  assert.doesNotMatch(auditRoute, /\.update\(/)
  assert.doesNotMatch(auditRoute, /deleteObject/)
})

test('storage audit checks database-enforced integrity dimensions', () => {
  assert.match(auditRoute, /referencedNonReady/)
  assert.match(auditRoute, /crossProjectReferences/)
  assert.match(auditRoute, /readyMissingIntegrityMetadata/)
  assert.match(auditRoute, /deletedMissingTimestamp/)
  assert.match(auditRoute, /criticalFindings/)
})

test('storage audit reports provider state counts without exposing object keys', () => {
  assert.match(auditRoute, /providerStateCounts/)
  assert.doesNotMatch(auditRoute, /object_key/)
  assert.doesNotMatch(auditRoute, /bucket/)
})

test('storage audit exposes fail-closed pre-cutover readiness without changing provider', () => {
  assert.match(auditRoute, /legacyAwaitingVerification/)
  assert.match(auditRoute, /r2ReadyObjects/)
  assert.match(auditRoute, /r2NonReadyObjects/)
  assert.match(auditRoute, /r2RuntimeConfigured/)
  assert.match(auditRoute, /preCutoverReady/)
  assert.match(auditRoute, /r2ReadyObjects > 0/)
  assert.match(auditRoute, /r2NonReadyObjects === 0/)
  assert.match(auditRoute, /legacyAwaitingVerification === 0/)
  assert.match(auditRoute, /STORAGE_DEFAULT_PROVIDER \?\? 'supabase'/)
  assert.match(auditRoute, /STORAGE_R2_PRODUCTION_CUTOVER_APPROVED/)
})

test('storage audit does not leak R2 credential values', () => {
  assert.doesNotMatch(auditRoute, /R2_ACCESS_KEY_ID[^\n]*process\.env\.R2_ACCESS_KEY_ID/)
  assert.doesNotMatch(auditRoute, /R2_SECRET_ACCESS_KEY[^\n]*process\.env\.R2_SECRET_ACCESS_KEY/)
  assert.match(auditRoute, /hasR2RuntimeConfiguration/)
})
