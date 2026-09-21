import assert from 'node:assert/strict'
import fs from 'node:fs'

const surfaces=[
  ['AI Command Center','app/admin/ai-command-center/page.tsx'],
  ['AI Audit Ledger','app/admin/ai-command-center/audit/page.tsx'],
  ['Command Center Explorer','app/admin/ai-command-center/explorer/page.tsx'],
  ['Learning Governance','app/admin/ai-command-center/learning-governance/page.tsx'],
  ['Pricing Authority','app/admin/ai-command-center/pricing-authority/page.tsx'],
  ['Resource Controls','app/admin/ai-command-center/resource-controls/page.tsx'],
]

for(const [label,path] of surfaces){
  const source=fs.readFileSync(path,'utf8')
  assert.ok(source.includes('<GlobalUtilityBar'), `${label} must use the shared Product Shell`)
  assert.ok(source.includes('id="main-content"'), `${label} must expose the shared skip-link target`)
  assert.ok(source.includes('tabIndex={-1}'), `${label} main target must be programmatically focusable`)
}

console.log('Wave 12 AI Command Center Product Shell contract passed.')
