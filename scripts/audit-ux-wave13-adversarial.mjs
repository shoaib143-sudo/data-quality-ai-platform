import assert from 'node:assert/strict'
import fs from 'node:fs'

const readOnly=[
  'app/admin/ai-command-center/traces/page.tsx',
  'app/admin/ai-command-center/retrieval-evaluation/page.tsx',
  'app/agents/[agentKey]/[version]/page.tsx',
  'app/agents/runs/[runId]/page.tsx',
  'app/ai-insights/page.tsx',
]
for(const path of readOnly){
  const source=fs.readFileSync(path,'utf8')
  assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(source), `adversarial: ${path} must not gain direct database mutation authority`)
  assert.ok(source.includes('id="main-content"'), `adversarial: ${path} must retain keyboard skip target`)
}

const traces=fs.readFileSync('app/admin/ai-command-center/traces/page.tsx','utf8')
const retrieval=fs.readFileSync('app/admin/ai-command-center/retrieval-evaluation/page.tsx','utf8')
assert.ok(traces.includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')"), 'adversarial: Trace Timeline must retain admin.manage authorization')
assert.ok(retrieval.includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')"), 'adversarial: Retrieval Evaluation must retain admin.manage authorization')

const autonomous=fs.readFileSync('app/agents/autonomous-governance/page.tsx','utf8')
for(const capability of ['agent.view','agent.execute','admin.manage','certification.review']){
  assert.ok(autonomous.includes(`'${capability}'`), `adversarial: Autonomous Governance must preserve ${capability} capability separation`)
}

const insights=fs.readFileSync('app/ai-insights/page.tsx','utf8')
assert.ok(insights.includes("authorizeProject(user.id, selectedProjectId, 'catalog.read')"), 'adversarial: AI Insights must retain governed project read authorization')
assert.ok(insights.includes('Suggestions remain advisory until the applicable governance approval is recorded.'), 'adversarial: AI recommendations must preserve advisory authority messaging')

const admin=fs.readFileSync('app/admin/page.tsx','utf8')
assert.ok(admin.includes(".in('role',['OWNER','ADMIN'])"), 'adversarial: Administration must preserve OWNER/ADMIN boundary')
assert.ok(!admin.includes('<nav className='), 'adversarial: Administration must not reintroduce a duplicate local shell')

const roleLanding=fs.readFileSync('components/governance/role-landing-page.tsx','utf8')
assert.ok(roleLanding.includes("const safeHref = (href: string, fallback='/catalog') => canAccessWorkspaceHref"), 'adversarial: persona-home route generation must remain fail-closed')
assert.ok(roleLanding.includes('const visibleNav = persona.nav.filter(item => canAccessWorkspaceHref'), 'adversarial: persona-home navigation must remain policy filtered')

console.log('Independent Wave 13 UX adversarial audit passed.')
