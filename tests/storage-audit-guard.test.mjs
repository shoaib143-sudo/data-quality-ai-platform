import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const auditRoute = fs.readFileSync(new URL('../app/api/internal/storage/audit/route.ts', import.meta.url), 'utf8')

test('storage audit requires internal authorization and is non-destructive', () => {
  assert.match(auditRoute, /CRON_SECRET/)
  assert.match(auditRoute, /Unauthorized/)
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
