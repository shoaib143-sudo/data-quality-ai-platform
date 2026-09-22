import assert from 'node:assert/strict'
import fs from 'node:fs'

const source={
  identity:fs.readFileSync('app/admin/identity/page.tsx','utf8'),
  infrastructure:fs.readFileSync('app/admin/infrastructure/page.tsx','utf8'),
  roles:fs.readFileSync('app/admin/project-roles/page.tsx','utf8'),
  learning:fs.readFileSync('app/admin/learning-cases/page.tsx','utf8'),
  cleanup:fs.readFileSync('app/admin/cleanup/page.tsx','utf8'),
  landing:fs.readFileSync('app/admin/landing-pages/page.tsx','utf8'),
}

for(const [label,text] of Object.entries(source)){
  assert.ok(text.includes('<GlobalUtilityBar'), `adversarial: ${label} must use shared shell`)
  assert.ok(text.includes('id="main-content"'), `adversarial: ${label} must preserve skip target`)
}

assert.ok(source.identity.includes(".in('role', ['OWNER','ADMIN'])"), 'adversarial: Identity must preserve OWNER/ADMIN authorization')
assert.ok(source.infrastructure.includes(".in('role', ['OWNER', 'ADMIN'])"), 'adversarial: Infrastructure must preserve OWNER/ADMIN authorization')
assert.ok(source.roles.includes(".in('role',['OWNER','ADMIN'])"), 'adversarial: Project Roles must preserve OWNER/ADMIN authorization')
assert.ok(source.learning.includes('authorizeDataGovernanceSuperAdminForOrganization'), 'adversarial: Learning Governance must preserve Super Admin authorization')
assert.ok(source.cleanup.includes('dataGovernanceSuperAdminOrganizationIds'), 'adversarial: Cleanup must preserve Super Admin organization authorization')
assert.ok(source.cleanup.includes("if (!organizationIds.length) redirect('/home')"), 'adversarial: Cleanup must fail closed when no Super Admin organization exists')
assert.ok(source.landing.includes(".in('role', ['OWNER', 'ADMIN'])"), 'adversarial: Landing Pages must preserve OWNER/ADMIN authorization')

assert.ok(source.identity.includes('canAdminWorkspace ? <div'), 'adversarial: Identity local admin navigation must fail closed')
assert.ok(source.infrastructure.includes('canAdminWorkspace ? <div'), 'adversarial: Infrastructure local admin navigation must fail closed')
assert.ok(source.roles.includes('canAdminWorkspace?<div'), 'adversarial: Project Roles local admin navigation must fail closed')
assert.ok(source.learning.includes('canAgents ? <Link href="/agents"') && source.learning.includes('canApprovals ? <Link href="/approvals"'), 'adversarial: Learning Governance cross-workspace links must fail closed')
assert.ok(source.cleanup.includes('canDatasets ? <Link href="/datasets"') && source.cleanup.includes('canMonitoring ? <Link href="/monitoring"'), 'adversarial: Cleanup cross-workspace links must fail closed')
assert.ok(source.landing.includes('canAdminWorkspace ? <Link href="/admin/project-roles"'), 'adversarial: Landing Pages admin link must fail closed')

assert.ok(!source.infrastructure.includes('R2_SECRET_ACCESS_KEY}'), 'adversarial: Infrastructure must not render an R2 secret value')
assert.ok(!/\.delete\s*\(/.test(source.cleanup), 'adversarial: Cleanup server page must not add direct destructive database authority')
assert.ok(source.landing.includes('<form action={setLandingPageEnabled}>'), 'adversarial: Landing Page mutation must remain routed through the existing governed server action')

console.log('Independent Wave 11 UX adversarial audit passed.')
