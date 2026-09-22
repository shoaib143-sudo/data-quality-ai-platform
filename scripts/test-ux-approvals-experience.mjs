import assert from 'node:assert/strict'
import fs from 'node:fs'
const source=fs.readFileSync('app/approvals/page.tsx','utf8')
for(const marker of ['Decide with evidence, scope and accountability.','Inbox decisions','Managed projects','Authority scopes','Decision comments remain mandatory','ApprovalInbox','ApprovalCoveragePanel','DelegationManager','DirectAuthorityAdminManager','DelegationAdminManager']) assert.ok(source.includes(marker), `approvals UX marker missing: ${marker}`)
assert.ok(source.includes("bg-[#050b17]"), 'approvals must use the native DataNexus dark canvas')
assert.ok(source.includes('loadApprovalInbox(user.id)'), 'approval inbox must remain user-scoped')
assert.ok(source.includes('loadApprovalCoverageWorkspace(user.id)'), 'approval coverage must remain user-scoped')
assert.ok(source.includes("canAccessWorkspace(landing.persona, 'agents'"), 'Agents transition must remain workspace gated')
assert.ok(source.includes("canAccessWorkspace(landing.persona, 'monitoring'"), 'Job Monitor transition must remain workspace gated')
console.log('Approvals UX experience contract passed.')
