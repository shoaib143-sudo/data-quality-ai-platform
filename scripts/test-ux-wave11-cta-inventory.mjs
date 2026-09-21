import assert from 'node:assert/strict'
import fs from 'node:fs'

const expected={
  'app/admin/identity/page.tsx':['Organization Admin','Project Roles','Landing Pages'],
  'app/admin/infrastructure/page.tsx':['Organization Access','Return home'],
  'app/admin/project-roles/page.tsx':['Organization Access','Landing Pages','Enterprise Identity','Return home'],
  'app/admin/learning-cases/page.tsx':['Agents','Approvals'],
  'app/admin/cleanup/page.tsx':['Super Admin Cleanup','Datasets & Sources','Job Monitor'],
  'app/admin/landing-pages/page.tsx':['Project Roles','Role Home','Disable','Enable'],
}

for(const [path,labels] of Object.entries(expected)){
  const source=fs.readFileSync(path,'utf8')
  for(const label of labels) assert.ok(source.includes(label), `${path} missing CTA or interaction: ${label}`)
}

for(const route of [
  'app/admin/page.tsx',
  'app/admin/project-roles/page.tsx',
  'app/admin/landing-pages/page.tsx',
  'app/admin/identity/page.tsx',
  'app/home/page.tsx',
  'app/agents/page.tsx',
  'app/approvals/page.tsx',
  'app/datasets/page.tsx',
  'app/monitoring/page.tsx',
]) assert.ok(fs.existsSync(route), `Wave 11 CTA destination missing: ${route}`)

console.log('Wave 11 CTA inventory and destination contract passed.')
