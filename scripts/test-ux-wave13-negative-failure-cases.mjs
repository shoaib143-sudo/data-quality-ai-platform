import assert from 'node:assert/strict'
import fs from 'node:fs'

const traces=fs.readFileSync('app/admin/ai-command-center/traces/page.tsx','utf8')
const retrieval=fs.readFileSync('app/admin/ai-command-center/retrieval-evaluation/page.tsx','utf8')
const detail=fs.readFileSync('app/agents/[agentKey]/[version]/page.tsx','utf8')
const run=fs.readFileSync('app/agents/runs/[runId]/page.tsx','utf8')
const autonomy=fs.readFileSync('app/agents/autonomous-governance/page.tsx','utf8')
const dataset=fs.readFileSync('app/datasets/dataset/[datasetId]/edit/page.tsx','utf8')
const source=fs.readFileSync('app/datasets/edit/[sourceId]/page.tsx','utf8')
const admin=fs.readFileSync('app/admin/page.tsx','utf8')
const insights=fs.readFileSync('app/ai-insights/page.tsx','utf8')
const sourceRegister=fs.readFileSync('app/api/datasets/source/register/route.ts','utf8')

assert.ok(traces.includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')"), 'negative: trace evidence must reject projects without admin.manage')
assert.ok(retrieval.includes("authorizeProject(user.id, selectedProjectId, 'admin.manage')"), 'negative: retrieval evidence must reject projects without admin.manage')

assert.ok(detail.includes('if (!agentRow) notFound()'), 'negative: missing agent versions must fail closed')
assert.ok(run.includes('if (!run) notFound()'), 'negative: missing agent runs must fail closed')
assert.ok(run.includes('if (!await canViewExecutionRun(user.id, run as AgentRun)) notFound()'), 'negative: unauthorized execution evidence must fail closed')
assert.ok(run.includes("'execution.view_evidence'"), 'negative: Agent Run must preserve evidence-specific authorization')
assert.ok(run.includes('catch {\n    notFound()'), 'negative: failed agent-action authorization must fail closed')

for(const [label,text] of [['Dataset edit',dataset],['Source edit',source]]){
  assert.ok(text.includes("if (!membership || !['OWNER', 'ADMIN', 'MEMBER'].includes(String(membership.role))) notFound()"), `negative: ${label} must reject non-members`)
}
assert.ok(dataset.includes('if (!dataset) notFound()') && dataset.includes('if (!project) notFound()'), 'negative: dataset edit must reject missing dataset/project')
assert.ok(source.includes('if (!source) notFound()') && source.includes('if (!project) notFound()'), 'negative: source edit must reject missing source/project')
assert.ok(source.includes("if (String(source.source_type).toUpperCase() !== 'JDBC')"), 'negative: non-JDBC edit must take the safe connector-specific fallback')
assert.ok(source.includes('This source is not a database/JDBC connection.'), 'negative: non-JDBC fallback must explain the unsupported edit path')

assert.ok(sourceRegister.includes("authorizeProject(user.id, projectId, 'source.manage')"), 'negative: source registration mutations must require source.manage')
assert.ok(!sourceRegister.includes("authorizeProject(user.id, projectId, 'catalog.read')"), 'negative: catalog.read must never authorize source registration mutations')

assert.ok(admin.includes(".in('role',['OWNER','ADMIN'])"), 'negative: Administration must preserve OWNER/ADMIN access requirement')
assert.ok(admin.includes('if(!organizationIds.length)'), 'negative: Administration must preserve no-admin fallback')
assert.ok(admin.includes('canCleanup=superAdminOrganizationIds.length>0'), 'negative: Cleanup visibility must fail closed without Super Admin scope')

assert.ok(autonomy.includes("hasProjectCapability(user.id, project.id, 'agent.view')"), 'negative: Autonomous Governance must preserve agent.view filtering')
assert.ok(autonomy.includes("hasProjectCapability(user.id, project.id, 'agent.execute')"), 'negative: Autonomous Governance must preserve agent.execute filtering')
assert.ok(autonomy.includes("hasProjectCapability(user.id, project.id, 'admin.manage')"), 'negative: Autonomous Governance must preserve admin.manage filtering')
assert.ok(autonomy.includes("hasProjectCapability(user.id, project.id, 'certification.review')"), 'negative: Autonomous Governance must preserve certification.review filtering')

assert.ok(insights.includes("authorizeProject(user.id, selectedProjectId, 'catalog.read')"), 'negative: AI Insights must preserve project catalog.read authorization')
assert.ok(insights.includes("const landingPrompt = (params.prompt ?? '').trim().slice(0, 1000)"), 'negative: AI Insights landing prompt must remain bounded')
assert.ok(insights.includes('No governed datasets are available for this project.'), 'negative: AI Insights must preserve truthful empty state')

console.log('Wave 13 negative and failure-path contract passed.')
