import assert from 'node:assert/strict'
import fs from 'node:fs'

const surfaces=[
  ['Enterprise Identity','app/admin/identity/page.tsx'],
  ['Infrastructure','app/admin/infrastructure/page.tsx'],
  ['Project Roles','app/admin/project-roles/page.tsx'],
  ['Learning Governance','app/admin/learning-cases/page.tsx'],
  ['Super Admin Cleanup','app/admin/cleanup/page.tsx'],
  ['Landing Pages','app/admin/landing-pages/page.tsx'],
]

for(const [label,path] of surfaces){
  const source=fs.readFileSync(path,'utf8')
  assert.ok(source.includes('<GlobalUtilityBar'), `${label} must use the shared Product Shell`)
  assert.ok(source.includes('id="main-content"'), `${label} must expose the shared skip-link target`)
  assert.ok(source.includes('tabIndex={-1}'), `${label} main target must be programmatically focusable`)
}

for(const [,path] of surfaces){
  const source=fs.readFileSync(path,'utf8')
  assert.ok(!source.includes('<nav className='), `${path} must not retain a duplicate page-level brand shell`)
}

console.log('Wave 11 admin control-plane Product Shell contract passed.')
