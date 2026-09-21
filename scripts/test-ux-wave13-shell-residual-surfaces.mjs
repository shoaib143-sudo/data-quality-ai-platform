import assert from 'node:assert/strict'
import fs from 'node:fs'

const surfaces=[
  ['AI Trace Timeline','app/admin/ai-command-center/traces/page.tsx'],
  ['Retrieval Evaluation','app/admin/ai-command-center/retrieval-evaluation/page.tsx'],
  ['Agent Detail','app/agents/[agentKey]/[version]/page.tsx'],
  ['Agent Run','app/agents/runs/[runId]/page.tsx'],
  ['Autonomous Governance','app/agents/autonomous-governance/page.tsx'],
  ['Edit Dataset','app/datasets/dataset/[datasetId]/edit/page.tsx'],
  ['Edit Source','app/datasets/edit/[sourceId]/page.tsx'],
  ['Administration','app/admin/page.tsx'],
  ['AI Insights','app/ai-insights/page.tsx'],
]

for(const [label,path] of surfaces){
  const source=fs.readFileSync(path,'utf8')
  assert.ok(source.includes('<GlobalUtilityBar'), `${label} must use the shared Product Shell`)
  assert.ok(source.includes('id="main-content"'), `${label} must expose the shared skip-link target`)
  assert.ok(source.includes('tabIndex={-1}'), `${label} main target must be programmatically focusable`)
}

console.log('Wave 13 residual Product Shell contract passed.')
