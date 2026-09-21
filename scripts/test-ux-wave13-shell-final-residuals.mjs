import assert from 'node:assert/strict'
import fs from 'node:fs'

const surfaces=[
  ['Trace Timeline','app/admin/ai-command-center/traces/page.tsx'],
  ['Retrieval Evaluation','app/admin/ai-command-center/retrieval-evaluation/page.tsx'],
  ['Agent Detail','app/agents/[agentKey]/[version]/page.tsx'],
  ['Agent Run','app/agents/runs/[runId]/page.tsx'],
  ['Autonomous Governance','app/agents/autonomous-governance/page.tsx'],
  ['AI Insights','app/ai-insights/page.tsx'],
  ['Edit Dataset','app/datasets/dataset/[datasetId]/edit/page.tsx'],
  ['Edit Connection','app/datasets/edit/[sourceId]/page.tsx'],
  ['Administration','app/admin/page.tsx'],
]

for(const [label,path] of surfaces){
  const source=fs.readFileSync(path,'utf8')
  assert.ok(source.includes('<GlobalUtilityBar'), `${label} must use the shared Product Shell`)
  assert.ok(source.includes('id="main-content"'), `${label} must expose the shared skip-link target`)
  assert.ok(source.includes('tabIndex={-1}'), `${label} main target must be programmatically focusable`)
}

const admin=fs.readFileSync('app/admin/page.tsx','utf8')
assert.ok(!admin.includes('<nav className='), 'Administration must not retain its legacy duplicate brand shell')

const roleLanding=fs.readFileSync('components/governance/role-landing-page.tsx','utf8')
assert.ok(roleLanding.includes('id="main-content"'), 'Persona home must retain its own focusable main target')
assert.ok(roleLanding.includes('tabIndex={-1}'), 'Persona home main target must remain focusable')
assert.ok(roleLanding.includes('canAccessWorkspaceHref'), 'Persona home must retain safe persona-route filtering')
assert.ok(roleLanding.includes('aria-label="Persona workspace"'), 'Persona home must retain its purpose-built persona navigation')
assert.ok(!roleLanding.includes('<GlobalUtilityBar'), 'Persona home is an intentional custom-shell exception and must not receive a duplicate global shell')

console.log('Wave 13 final residual Product Shell and persona-home exception contract passed.')
