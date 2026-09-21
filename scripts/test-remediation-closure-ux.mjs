import assert from 'node:assert/strict'
import fs from 'node:fs'
import { isVerifiedRemediationClosure } from '../lib/governance/remediation-closure-state.ts'

assert.equal(isVerifiedRemediationClosure({ outcomeStatus: 'VERIFIED', issueStatuses: [] }), true)
assert.equal(isVerifiedRemediationClosure({ outcomeStatus: 'VERIFIED_RESOLVED', issueStatuses: ['RESOLVED', 'CLOSED'] }), true)
assert.equal(isVerifiedRemediationClosure({ outcomeStatus: 'VERIFIED', issueStatuses: ['OPEN'] }), false)
assert.equal(isVerifiedRemediationClosure({ outcomeStatus: 'VERIFICATION_FAILED', issueStatuses: ['RESOLVED'] }), false)
assert.equal(isVerifiedRemediationClosure({ outcomeStatus: 'VERIFIED', issueStatuses: ['RESOLVED', 'IN_PROGRESS'] }), false)
assert.equal(isVerifiedRemediationClosure({ outcomeStatus: null, issueStatuses: [] }), false)

const panel = fs.readFileSync('app/profiling/profiling-governance-panel.tsx', 'utf8')
const incident = fs.readFileSync('app/issues/[issueId]/page.tsx', 'utf8')
for (const cta of [
  'Start governed approval',
  'Track remediation',
  'Check verification',
  'Retry automatic verification',
  'Restart automatic verification',
  'Resolve with evidence',
  'Open Governance Workflows',
]) assert.ok(panel.includes(cta), `remediation CTA missing: ${cta}`)
assert.ok(panel.includes('Verified closure'), 'verified closure state must be visible')
assert.ok(panel.includes('Evidence backed'), 'verified closure must be labelled evidence backed')
assert.ok(panel.includes('canonicalRoutes.governedIncident(issue.id)'), 'tracked remediation issues must link to the governed incident')
assert.ok(panel.includes('/profiling/explorer?runId='), 'verification profile must deep link to evidence')
assert.ok(panel.includes('/monitoring?run='), 'verification job must deep link to Job Monitor')
assert.ok(panel.includes('Resolution evidence is required'), 'issue resolution must fail closed without evidence')
assert.ok(incident.includes('canonicalRoutes.governanceRun(projectId)'), 'governed incident must return users to its project Governance Run')
assert.ok(incident.includes('Governance Run'), 'governed incident must expose a Governance Run CTA')
console.log('Remediation verified-closure unit and CTA tests passed.')