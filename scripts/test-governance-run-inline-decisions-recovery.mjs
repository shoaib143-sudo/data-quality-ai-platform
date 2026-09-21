import assert from 'node:assert/strict'
import fs from 'node:fs'

const run = fs.readFileSync('app/journeys/[projectId]/page.tsx', 'utf8')
const inbox = fs.readFileSync('lib/governance/approval-inbox.ts', 'utf8')

assert.ok(inbox.includes("'project_id'"), 'authorized approval client view must carry project identity')
assert.ok(run.includes('const approvalInboxPromise = canApprovals ? loadApprovalInbox(user.id) : Promise.resolve([])'), 'Governance Run approval data must be persona gated')
assert.ok(run.includes("String(item.request.project_id ?? '') === projectId"), 'Governance Run must filter already-authorized approvals to the current project')
assert.ok(run.includes('const pendingApprovals = projectApprovals.filter'), 'Governance Run must summarize pending approvals')
assert.ok(run.includes("normalized(item.request.status) === 'READY_TO_EXECUTE'"), 'Governance Run must surface ready-to-execute approval state')
assert.ok(run.includes('Visible governed decisions'), 'Governance Run must expose visible project decisions')
assert.ok(run.includes('Open approval inbox'), 'Governance Run decisions must route to the canonical approval inbox')
assert.ok(run.includes("state: profileFailed ? 'BLOCKED' : latestCompletedRun ? 'COMPLETE'"), 'latest failed profile must outrank older completed profiling evidence')
assert.ok(run.includes("href: profileFailed && canMonitoring ? executionHref : profileHref"), 'failed profiling must route to execution evidence when authorized')
assert.ok(run.includes("canMonitoring ? 'Open failed execution' : 'Review profiling evidence'"), 'failed profiling CTA must match access and destination')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(run), 'Governance Run decisions must remain a read-only projection')

console.log('Governance Run inline decisions and failure-recovery contract passed.')
