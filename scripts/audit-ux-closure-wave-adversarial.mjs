import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolveProfilingRunHandoff } from '../lib/profiling/profiling-run-handoff.ts'
import { isVerifiedRemediationClosure } from '../lib/governance/remediation-closure-state.ts'

const governanceRun = fs.readFileSync('app/journeys/[projectId]/page.tsx', 'utf8')
const dataset360 = fs.readFileSync('app/catalog/dataset/[datasetId]/page.tsx', 'utf8')
const datasetActions = fs.readFileSync('app/datasets/dataset-actions.tsx', 'utf8')
const registration = fs.readFileSync('app/datasets/register-dataset-form.tsx', 'utf8')
const remediation = fs.readFileSync('app/profiling/profiling-governance-panel.tsx', 'utf8')

assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(governanceRun), 'adversarial: Governance Run must not acquire mutation authority')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(dataset360), 'adversarial: Dataset 360 must not acquire mutation authority')
assert.ok(governanceRun.includes(".eq('organization_id', landing.organizationId)"), 'adversarial: cross-organization project lookup must fail closed')
assert.ok(datasetActions.includes("effectiveReady && agentDefinitionId"), 'adversarial: profiling CTA must not render without deterministic readiness and agent definition')
assert.ok(registration.includes('if (!response.ok) throw new Error'), 'adversarial: rejected profiling submission must not navigate as if accepted')
assert.throws(() => resolveProfilingRunHandoff(null), /agent run identifier/)
assert.equal(resolveProfilingRunHandoff({ agentRunId: 'x', monitorUrl: 'javascript:alert(1)' }).monitorUrl, '/monitoring?run=x')
assert.equal(isVerifiedRemediationClosure({ outcomeStatus: 'VERIFIED', issueStatuses: ['RESOLVED', 'OPEN'] }), false, 'adversarial: one open issue must prevent verified closure')
assert.equal(isVerifiedRemediationClosure({ outcomeStatus: 'COMPLETED', issueStatuses: [] }), false, 'adversarial: completion must not be misrepresented as verification')
assert.ok(remediation.includes('canManageRemediation'), 'adversarial: remediation actions must remain capability gated')
assert.ok(remediation.includes('disabled={busy !== null}'), 'adversarial: remediation mutations must suppress double submission')
console.log('Independent adversarial audit passed for Product UX, Dataset 360, Golden Path, Governance Run and Remediation.')
