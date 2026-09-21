import assert from 'node:assert/strict'
import fs from 'node:fs'

const expected={
  'app/admin/ai-command-center/traces/page.tsx':['AI Command Center','Administration','Load traces'],
  'app/admin/ai-command-center/retrieval-evaluation/page.tsx':['AI Command Center','Administration','Load retrieval evidence'],
  'app/agents/[agentKey]/[version]/page.tsx':['Back to AI Agents','Run an agent','Open Job Monitor','View run'],
  'app/agents/runs/[runId]/page.tsx':['Back to AI Agents','Execution steps','Run logs','Run output'],
  'app/agents/autonomous-governance/page.tsx':['Back to AI Agents','Open Job Monitor','Autonomous Governance'],
  'app/datasets/dataset/[datasetId]/edit/page.tsx':['Back to datasets','Edit dataset'],
  'app/datasets/edit/[sourceId]/page.tsx':['Back to connections','Edit database connection','Edit connection'],
  'app/admin/page.tsx':['Organization Access','Project Roles','Landing Pages','Enterprise Identity','Infrastructure','AI Command Center'],
  'app/ai-insights/page.tsx':['AI capability coverage','Load AI evidence','Open profiling evidence'],
}

for(const [path,labels] of Object.entries(expected)){
  const source=fs.readFileSync(path,'utf8')
  for(const label of labels) assert.ok(source.includes(label), `${path} missing CTA or interaction: ${label}`)
}

for(const route of [
  'app/admin/page.tsx',
  'app/admin/ai-command-center/page.tsx',
  'app/ai-capabilities/page.tsx',
  'app/agents/page.tsx',
  'app/monitoring/page.tsx',
  'app/datasets/page.tsx',
  'app/data-quality/rules/page.tsx',
  'app/profiling/explorer/page.tsx',
]) assert.ok(fs.existsSync(route), `Wave 13 CTA destination missing: ${route}`)

console.log('Wave 13 CTA inventory and destination contract passed.')
