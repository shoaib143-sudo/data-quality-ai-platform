import assert from 'node:assert/strict'
import fs from 'node:fs'

const expected={
  'app/admin/ai-command-center/page.tsx':['Administration','AI Capability Control Center','Load control state'],
  'app/admin/ai-command-center/audit/page.tsx':['AI Command Center','Administration','Load audit evidence'],
  'app/admin/ai-command-center/explorer/page.tsx':['Load evidence'],
  'app/admin/ai-command-center/learning-governance/page.tsx':['AI Command Center','Administration','Load learning evidence'],
  'app/admin/ai-command-center/pricing-authority/page.tsx':['AI Command Center','Resource controls','Load pricing authority'],
  'app/admin/ai-command-center/resource-controls/page.tsx':['AI Command Center','Administration','Load control evidence'],
}

for(const [path,labels] of Object.entries(expected)){
  const source=fs.readFileSync(path,'utf8')
  for(const label of labels) assert.ok(source.includes(label), `${path} missing CTA or interaction: ${label}`)
}

for(const route of [
  'app/admin/page.tsx',
  'app/ai-capabilities/page.tsx',
  'app/admin/ai-command-center/page.tsx',
  'app/admin/ai-command-center/resource-controls/page.tsx',
]) assert.ok(fs.existsSync(route), `Wave 12 CTA destination missing: ${route}`)

console.log('Wave 12 CTA inventory and destination contract passed.')
