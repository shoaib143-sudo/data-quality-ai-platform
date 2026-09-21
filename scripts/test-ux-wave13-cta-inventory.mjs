import assert from 'node:assert/strict'
import fs from 'node:fs'

const expected={
  'app/admin/ai-command-center/traces/page.tsx':['Load traces'],
  'app/admin/ai-command-center/retrieval-evaluation/page.tsx':['AI Command Center','Administration','Load retrieval evidence'],
  'app/agents/[agentKey]/[version]/page.tsx':['Back to AI Agents','Run an agent','Open Job Monitor','View run','Read-only run evidence'],
  'app/agents/runs/[runId]/page.tsx':['Back to AI Agents','Governed execution evidence'],
  'app/agents/autonomous-governance/page.tsx':['Back to AI Agents','Open Job Monitor'],
  'app/ai-insights/page.tsx':['Role home','AI capability coverage','Load AI evidence'],
  'app/datasets/dataset/[datasetId]/edit/page.tsx':['Back to datasets','Edit dataset'],
  'app/datasets/edit/[sourceId]/page.tsx':['Back to connections','Edit connection','Edit database connection'],
  'app/admin/page.tsx':['Organization Access','Super Admin Cleanup','Project Roles','Landing Pages','Enterprise Identity','Infrastructure','AI Command Center','AI Resource Controls','AI Audit Evidence'],
}

for(const [path,labels] of Object.entries(expected)){
  const source=fs.readFileSync(path,'utf8')
  for(const label of labels) assert.ok(source.includes(label), `${path} missing CTA or interaction: ${label}`)
}

for(const route of [
  'app/admin/page.tsx',
  'app/admin/cleanup/page.tsx',
  'app/admin/project-roles/page.tsx',
  'app/admin/landing-pages/page.tsx',
  'app/admin/identity/page.tsx',
  'app/admin/infrastructure/page.tsx',
  'app/admin/ai-command-center/page.tsx',
  'app/admin/ai-command-center/resource-controls/page.tsx',
  'app/admin/ai-command-center/audit/page.tsx',
  'app/agents/page.tsx',
  'app/monitoring/page.tsx',
  'app/ai-capabilities/page.tsx',
  'app/datasets/page.tsx',
]) assert.ok(fs.existsSync(route), `Wave 13 CTA destination missing: ${route}`)

console.log('Wave 13 CTA inventory and destination contract passed.')
