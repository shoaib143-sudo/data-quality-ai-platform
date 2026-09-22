import assert from 'node:assert/strict'
import fs from 'node:fs'

const paths=[
  'app/admin/ai-command-center/page.tsx',
  'app/admin/ai-command-center/audit/page.tsx',
  'app/admin/ai-command-center/explorer/page.tsx',
  'app/admin/ai-command-center/learning-governance/page.tsx',
  'app/admin/ai-command-center/pricing-authority/page.tsx',
  'app/admin/ai-command-center/resource-controls/page.tsx',
]

for(const path of paths){
  const source=fs.readFileSync(path,'utf8')
  assert.ok(source.includes('<GlobalUtilityBar'), `adversarial: ${path} must use the shared shell`)
  assert.ok(source.includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')"), `adversarial: ${path} must preserve project admin.manage authorization`)
  assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(source), `adversarial: ${path} must remain read-only at the page boundary`)
}

const root=fs.readFileSync(paths[0],'utf8')
const auditPage=fs.readFileSync(paths[1],'utf8')
const learning=fs.readFileSync(paths[3],'utf8')
const pricing=fs.readFileSync(paths[4],'utf8')
const resource=fs.readFileSync(paths[5],'utf8')

assert.ok(root.includes('canAdminWorkspace ? <Link href="/admin"'), 'adversarial: root admin navigation must fail closed')
assert.ok(root.includes('canAiCapabilities ? <Link href="/ai-capabilities"'), 'adversarial: root AI capability navigation must fail closed')
for(const [label,source] of [['audit',auditPage],['learning',learning],['pricing',pricing],['resource',resource]]){
  assert.ok(source.includes('canAdminWorkspace ? <div'), `adversarial: ${label} local admin navigation must fail closed`)
}
assert.ok(resource.includes('this page exposes no pause, kill, resume, admission, lease, or policy mutation action'), 'adversarial: Resource Controls must preserve explicit read-only authority messaging')
assert.ok(learning.includes('This view exposes no review, approval, promotion, activation, rollback, tool-authority, or mutation action'), 'adversarial: Learning Governance must preserve explicit read-only authority messaging')

console.log('Independent Wave 12 UX adversarial audit passed.')
