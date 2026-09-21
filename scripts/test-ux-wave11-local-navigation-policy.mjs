import assert from 'node:assert/strict'
import fs from 'node:fs'

const identity=fs.readFileSync('app/admin/identity/page.tsx','utf8')
const infrastructure=fs.readFileSync('app/admin/infrastructure/page.tsx','utf8')
const roles=fs.readFileSync('app/admin/project-roles/page.tsx','utf8')
const learning=fs.readFileSync('app/admin/learning-cases/page.tsx','utf8')
const cleanup=fs.readFileSync('app/admin/cleanup/page.tsx','utf8')
const landing=fs.readFileSync('app/admin/landing-pages/page.tsx','utf8')

for(const [label,source] of [['Identity',identity],['Infrastructure',infrastructure],['Project Roles',roles],['Landing Pages',landing]]){
  assert.ok(source.includes("canAccessWorkspaceHref(landing.persona, '/admin', landing.organizationRole)") || source.includes("canAccessWorkspaceHref(landing.persona,'/admin',landing.organizationRole)"), `${label} admin navigation must derive from workspace policy`)
  assert.ok(source.includes('canAdminWorkspace'), `${label} admin-local navigation must fail closed`)
}

assert.ok(learning.includes("canAccessWorkspaceHref(landing.persona, '/agents', landing.organizationRole)"), 'Learning Governance Agents CTA must derive from workspace policy')
assert.ok(learning.includes("canAccessWorkspaceHref(landing.persona, '/approvals', landing.organizationRole)"), 'Learning Governance Approvals CTA must derive from workspace policy')
assert.ok(learning.includes('canAgents ? <Link href="/agents"'), 'Learning Governance must hide Agents when inaccessible')
assert.ok(learning.includes('canApprovals ? <Link href="/approvals"'), 'Learning Governance must hide Approvals when inaccessible')

assert.ok(cleanup.includes("canAccessWorkspaceHref(landing.persona, '/datasets', landing.organizationRole)"), 'Cleanup Datasets CTA must derive from workspace policy')
assert.ok(cleanup.includes("canAccessWorkspaceHref(landing.persona, '/monitoring', landing.organizationRole)"), 'Cleanup Monitor CTA must derive from workspace policy')
assert.ok(cleanup.includes('canDatasets ? <Link href="/datasets"'), 'Cleanup must hide Datasets when inaccessible')
assert.ok(cleanup.includes('canMonitoring ? <Link href="/monitoring"'), 'Cleanup must hide Job Monitor when inaccessible')

console.log('Wave 11 local-navigation policy contract passed.')
