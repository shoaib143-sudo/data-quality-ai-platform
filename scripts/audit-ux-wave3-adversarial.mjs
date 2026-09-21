import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolveMonitorRoute } from '../lib/monitoring/monitor-route.ts'

const approvals = fs.readFileSync('app/approvals/page.tsx', 'utf8')
const inbox = fs.readFileSync('app/approvals/approval-inbox.tsx', 'utf8')
const workflows = fs.readFileSync('app/workflows/page.tsx', 'utf8')
const run = fs.readFileSync('app/journeys/[projectId]/page.tsx', 'utf8')
const dataset = fs.readFileSync('app/catalog/dataset/[datasetId]/page.tsx', 'utf8')
const incident = fs.readFileSync('app/issues/[issueId]/page.tsx', 'utf8')
const view = fs.readFileSync('lib/governance/governed-incident-view.ts', 'utf8')

assert.equal(resolveMonitorRoute({ runId: 'x', monitorUrl: 'javascript:alert(1)' }), '/monitoring?run=x')
assert.equal(resolveMonitorRoute({ runId: 'x', monitorUrl: 'https://attacker.invalid/monitoring' }), '/monitoring?run=x')
assert.ok(inbox.includes('resolveMonitorRoute'), 'adversarial: approval execution redirects must be constrained to Job Monitor')
assert.ok(approvals.includes("canAccessWorkspace(landing.persona, 'monitoring'"), 'adversarial: Approvals must not expose Job Monitor to unauthorized personas')
assert.ok(workflows.includes("canAccessWorkspace(landing.persona,'issues'"), 'adversarial: Workflow local navigation must remain persona filtered')
assert.ok(run.includes("String(item.request.project_id ?? '') === projectId"), 'adversarial: approval state from another project must not appear in this Governance Run')
assert.ok(run.includes("state: profileFailed ? 'BLOCKED'"), 'adversarial: older successful profiles must not mask a current failed run')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(run), 'adversarial: Governance Run must remain read only')
assert.ok(dataset.includes('.limit(8)'), 'adversarial: dataset version history must remain bounded')
assert.ok(incident.includes('Number.isFinite(Date.parse(String(item.observedAt)))'), 'adversarial: malformed timestamps must not enter remediation chronology')
assert.ok(view.includes('dueAt: truth.dueAt ?? null'), 'adversarial: SLA truth changes must invalidate the incident truth fingerprint')

console.log('Independent Wave 3 UX adversarial audit passed.')
