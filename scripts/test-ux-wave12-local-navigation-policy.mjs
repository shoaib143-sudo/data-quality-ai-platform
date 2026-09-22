import assert from 'node:assert/strict'
import fs from 'node:fs'

const root=fs.readFileSync('app/admin/ai-command-center/page.tsx','utf8')
const audit=fs.readFileSync('app/admin/ai-command-center/audit/page.tsx','utf8')
const explorer=fs.readFileSync('app/admin/ai-command-center/explorer/page.tsx','utf8')
const learning=fs.readFileSync('app/admin/ai-command-center/learning-governance/page.tsx','utf8')
const pricing=fs.readFileSync('app/admin/ai-command-center/pricing-authority/page.tsx','utf8')
const resource=fs.readFileSync('app/admin/ai-command-center/resource-controls/page.tsx','utf8')

assert.ok(root.includes("canAccessWorkspaceHref(landing.persona, '/admin', landing.organizationRole)"), 'Command Center Administration CTA must derive from workspace policy')
assert.ok(root.includes("canAccessWorkspaceHref(landing.persona, '/ai-capabilities', landing.organizationRole)"), 'Command Center AI Capabilities CTA must derive from workspace policy')
assert.ok(root.includes('canAdminWorkspace ? <Link href="/admin"'), 'Command Center must hide Administration when inaccessible')
assert.ok(root.includes('canAiCapabilities ? <Link href="/ai-capabilities"'), 'Command Center must hide AI Capabilities when inaccessible')

for(const [label,source] of [['Audit',audit],['Learning',learning],['Pricing',pricing],['Resource Controls',resource]]){
  assert.ok(source.includes("canAccessWorkspaceHref(landing.persona, '/admin', landing.organizationRole)"), `${label} admin navigation must derive from workspace policy`)
  assert.ok(source.includes('canAdminWorkspace ? <div'), `${label} admin-local navigation must fail closed`)
}

assert.ok(explorer.includes('resolveLandingAccess(user.id)'), 'Explorer must resolve shared persona context for the Product Shell')

console.log('Wave 12 local-navigation policy contract passed.')
