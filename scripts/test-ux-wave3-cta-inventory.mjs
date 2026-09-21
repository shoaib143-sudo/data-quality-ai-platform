import assert from 'node:assert/strict'
import fs from 'node:fs'

const files = {
  approvals: fs.readFileSync('app/approvals/page.tsx', 'utf8'),
  inbox: fs.readFileSync('app/approvals/approval-inbox.tsx', 'utf8'),
  workflows: fs.readFileSync('app/workflows/page.tsx', 'utf8'),
  governanceRun: fs.readFileSync('app/journeys/[projectId]/page.tsx', 'utf8'),
  incident: fs.readFileSync('app/issues/[issueId]/page.tsx', 'utf8'),
}

const expected = {
  approvals: ['Agents', 'Job Monitor'],
  inbox: ['Execute requested action', 'Approve', 'Reject'],
  workflows: ['Issues', 'Profiling evidence', 'Governance Runs'],
  governanceRun: ['Open approval inbox', 'Open failed execution', 'Review profiling evidence'],
  incident: ['Issues', 'Governance Run', 'Remediation evidence timeline'],
}

for (const [key, labels] of Object.entries(expected)) {
  for (const label of labels) assert.ok(files[key].includes(label), `${key} missing CTA or interaction: ${label}`)
}

const inboxButtons = [...files.inbox.matchAll(/<button\b[\s\S]*?>/g)].map(match => match[0])
assert.ok(inboxButtons.length >= 3, 'approval inbox must retain execution/approve/reject controls')
for (const tag of inboxButtons) assert.ok(/\btype=/.test(tag), `approval inbox button missing explicit type: ${tag}`)
assert.ok(files.inbox.includes('disabled={busy === key}'), 'approval decision CTAs must suppress double submission')
assert.ok(files.inbox.includes('role="status"'), 'approval result/error messaging must be announced accessibly')
assert.ok(files.approvals.includes('id="main-content"'), 'Approvals shared shell must have a skip-link target')
assert.ok(files.workflows.includes('id="main-content"'), 'Workflows shared shell must have a skip-link target')

console.log('Wave 3 CTA inventory and interaction-state contract passed.')
