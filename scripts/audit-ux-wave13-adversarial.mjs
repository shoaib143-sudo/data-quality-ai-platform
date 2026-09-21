import assert from 'node:assert/strict'
import fs from 'node:fs'

const pages=[
  'app/admin/ai-command-center/traces/page.tsx',
  'app/admin/ai-command-center/retrieval-evaluation/page.tsx',
  'app/agents/[agentKey]/[version]/page.tsx',
  'app/agents/runs/[runId]/page.tsx',
  'app/agents/autonomous-governance/page.tsx',
  'app/datasets/dataset/[datasetId]/edit/page.tsx',
  'app/datasets/edit/[sourceId]/page.tsx',
  'app/admin/page.tsx',
  'app/ai-insights/page.tsx',
]
const source=Object.fromEntries(pages.map(path=>[path,fs.readFileSync(path,'utf8')]))

for(const path of pages){
  assert.ok(source[path].includes('<GlobalUtilityBar'), `adversarial: ${path} must use the shared shell`)
  assert.ok(source[path].includes('id="main-content"'), `adversarial: ${path} must preserve the skip target`)
  assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(source[path]), `adversarial: ${path} must not gain direct database mutation authority`)
}

assert.ok(source['app/admin/ai-command-center/traces/page.tsx'].includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')"), 'adversarial: Trace Timeline must preserve admin.manage authorization')
assert.ok(source['app/admin/ai-command-center/retrieval-evaluation/page.tsx'].includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')"), 'adversarial: Retrieval Evaluation must preserve admin.manage authorization')
assert.ok(source['app/agents/runs/[runId]/page.tsx'].includes('canViewExecutionRun'), 'adversarial: Agent Run resource authorization must remain authoritative')
assert.ok(source['app/agents/runs/[runId]/page.tsx'].includes('authorizeAgentAction'), 'adversarial: Agent Run action authorization must remain authoritative')
assert.ok(source['app/admin/page.tsx'].includes('dataGovernanceSuperAdminOrganizationIds'), 'adversarial: cleanup navigation must derive from authoritative Super Admin scope')
assert.ok(source['app/admin/page.tsx'].includes('canCleanup ? <Link href="/admin/cleanup"'), 'adversarial: cleanup CTA must not be exposed without Super Admin scope')
assert.ok(source['app/ai-insights/page.tsx'].includes("authorizeProject(user.id, selectedProjectId, 'catalog.read')"), 'adversarial: AI Insights must preserve catalog authorization')
assert.ok(source['app/datasets/edit/[sourceId]/page.tsx'].includes("source.source_type).toUpperCase() !== 'JDBC'"), 'adversarial: source edit must preserve non-JDBC safe fallback')

console.log('Independent Wave 13 UX adversarial audit passed.')
