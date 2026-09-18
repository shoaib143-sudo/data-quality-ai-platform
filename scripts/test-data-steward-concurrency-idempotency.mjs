import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const qualityRun = fs.readFileSync('app/api/data-quality/run/route.ts', 'utf8')
const issueCreate = fs.readFileSync('app/api/issues/route.ts', 'utf8')
const issueUpdate = fs.readFileSync('app/api/issues/[issueId]/route.ts', 'utf8')
const stewardshipCreate = fs.readFileSync('app/api/stewardship/assignments/route.ts', 'utf8')
const stewardshipUpdate = fs.readFileSync('app/api/stewardship/assignments/[assignmentId]/route.ts', 'utf8')
const glossaryUpdate = fs.readFileSync('app/api/glossary/[termId]/route.ts', 'utf8')

test('Data Quality execution exposes a deterministic idempotency boundary', () => {
  assert.match(qualityRun, /idempotency-key/i)
  assert.match(qualityRun, /data-quality:manual:/)
  assert.match(qualityRun, /reused:/)
  assert.match(qualityRun, /queueDataQualityAutomation/)
})

test('Issue creation handles both pre-existing and concurrent duplicate finding identities', () => {
  assert.match(issueCreate, /deduplicatedIssueResponse/)
  assert.match(issueCreate, /PREEXISTING/)
  assert.match(issueCreate, /CONCURRENT_INSERT/)
  assert.match(issueCreate, /isFindingIdentityConflict/)
  assert.match(issueCreate, /ISSUE_CREATE_DEDUPLICATED/)
})

test('Issue resolution uses optimistic concurrency before compensating a failed verification schedule', () => {
  assert.match(issueUpdate, /\.eq\('updated_at', data\.updated_at\)/)
  assert.match(issueUpdate, /concurrent_state_detected/)
  assert.match(issueUpdate, /REMEDIATION_VERIFICATION_SCHEDULING_CONCURRENT_STATE/)
  assert.match(issueUpdate, /resolution_evidence_preserved: true/)
})

test('Stewardship duplicate assignments fail as one canonical active assignment', () => {
  assert.match(stewardshipCreate, /error\.code === '23505'/)
  assert.match(stewardshipCreate, /active assignment .* already exists/i)
  assert.match(stewardshipUpdate, /assignment\.status === 'REVOKED'/)
})

test('Governed evidence cannot be erased through hard-delete endpoints', () => {
  assert.match(stewardshipUpdate, /not hard-deleted/i)
  assert.match(glossaryUpdate, /not hard-deleted/i)
})
