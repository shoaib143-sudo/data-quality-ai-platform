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
const explorer = fs.readFileSync('app/profiling/explorer/page.tsx', 'utf8')
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
assert.ok(panel.includes('Quality before → after'), 'verified closure must show before-after quality evidence')
assert.ok(panel.includes('High severity before → after'), 'verified closure must show before-after finding evidence')
assert.ok(explorer.includes('source_quality_score,verification_quality_score'), 'profiling explorer must load persisted quality baseline and verification values')
assert.ok(explorer.includes('source_high_severity_findings,verification_high_severity_findings'), 'profiling explorer must load persisted finding baseline and verification values')
assert.ok(panel.includes('canonicalRoutes.governedIncident(issue.id)'), 'tracked remediation issues must link to the governed incident')
assert.ok(panel.includes('/profiling/explorer?runId='), 'verification profile must deep link to evidence')
assert.ok(panel.includes('/monitoring?run='), 'verification job must deep link to Job Monitor')
assert.ok(panel.includes('Resolution evidence is required'), 'issue resolution must fail closed without evidence')
assert.ok(incident.includes('canonicalRoutes.governanceRun(projectId)'), 'governed incident must return users to its project Governance Run')
assert.ok(incident.includes('Governance Run'), 'governed incident must expose a Governance Run CTA')
assert.ok(incident.includes('<GlobalUtilityBar'), 'governed incident must use the shared Product Shell')
assert.ok(incident.includes('roleLabel="Governed incident"'), 'incident Product Shell must preserve remediation context')
console.log('Remediation verified-closure unit and CTA tests passed.')