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

const policy=fs.readFileSync('lib/governance/workspace-policy.ts','utf8')
const lineageLayout=fs.readFileSync('app/lineage/layout.tsx','utf8')
const datasetsLayout=fs.readFileSync('app/datasets/layout.tsx','utf8')
const catalog=fs.readFileSync('app/catalog/page.tsx','utf8')
const physicalAssets=fs.readFileSync('app/catalog/physical-assets/page.tsx','utf8')

assert.ok(policy.includes("['/lineage/ingest', 'lineage-manage']"), 'adversarial: direct lineage ingest must remain lineage-manage gated')
assert.ok(policy.includes("['/catalog/discovery', 'discovery']"), 'adversarial: direct discovery route must remain discovery gated')
assert.ok(policy.includes("['/agents', 'agents']"), 'adversarial: direct agents route must remain agents gated')
assert.ok(lineageLayout.includes("requireWorkspaceAccess('lineage')"), 'adversarial: lineage layout must retain read-access boundary')
assert.ok(datasetsLayout.includes("requireWorkspaceAccess('datasets')"), 'adversarial: datasets layout must retain workspace boundary')
assert.ok(!/lineage-manage[^\n]*\?\s*true/.test(lineageLayout), 'adversarial: lineage management visibility must not be hard-coded open')
assert.ok(!/agents[^\n]*\?\s*true|discovery[^\n]*\?\s*true/.test(datasetsLayout), 'adversarial: dataset privileged-link visibility must not be hard-coded open')
assert.ok(catalog.includes("hasProjectCapability(user.id,projectId,'discovery.execute')"), 'adversarial: Catalog must retain project Discovery capability evaluation')
assert.ok(catalog.includes("canAccessWorkspace(landing.persona,'discovery',landing.organizationRole)"), 'adversarial: Catalog must combine persona policy with project capability')
assert.ok(!catalog.includes('const canDiscover=capabilityRows.some'), 'adversarial: Catalog must not advertise Discovery from capability alone')
assert.ok(physicalAssets.includes("canAccessWorkspace(landing.persona, 'dashboard', landing.organizationRole)"), 'adversarial: Physical Assets dashboard destination must use persona policy')
assert.ok(physicalAssets.includes("canAccessWorkspace(landing.persona, 'discovery', landing.organizationRole)"), 'adversarial: Physical Assets Discovery visibility must use persona policy')
assert.ok(physicalAssets.includes("homeHref={canDashboard ? '/dashboard' : '/home'}"), 'adversarial: denied Dashboard access must fall back to Role Home')

const utility=fs.readFileSync('components/app-shell/global-utility-bar.tsx','utf8')
const skip=fs.readFileSync('components/app-shell/skip-to-content.tsx','utf8')
assert.ok(utility.includes('<SkipToContent targetId="workspace-content-start" />'), 'adversarial: shared skip link must target content after repeated navigation')
assert.ok(utility.includes('<div id="workspace-content-start" tabIndex={-1}'), 'adversarial: shared shell must expose a focusable post-navigation target')
const skipIndex=utility.indexOf('<SkipToContent targetId="workspace-content-start" />')
const headerIndex=utility.indexOf('<header')
const targetIndex=utility.indexOf('<div id="workspace-content-start"')
assert.ok(skipIndex >= 0 && headerIndex > skipIndex && targetIndex > headerIndex, 'adversarial: skip target must occur after repeated global navigation')
assert.ok(skip.includes('targetId') && skip.includes('focus:not-sr-only') && skip.includes('focus:fixed'), 'adversarial: skip control must remain target-bound, visible and operable on focus')

console.log('Independent Wave 13 UX adversarial audit passed.')
