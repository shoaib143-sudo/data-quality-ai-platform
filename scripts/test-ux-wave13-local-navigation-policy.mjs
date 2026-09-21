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

for(const [label,text] of [['Traces',traces],['Retrieval',retrieval]]){
  assert.ok(text.includes("canAccessWorkspaceHref(landing.persona, '/admin', landing.organizationRole)"), `${label} admin navigation must derive from workspace policy`)
  assert.ok(text.includes('canAdminWorkspace ? <div'), `${label} admin navigation must fail closed`)
}

assert.ok(detail.includes("canAccessWorkspaceHref(landing.persona, '/agents', landing.organizationRole)"), 'Agent Detail Agents navigation must derive from workspace policy')
assert.ok(detail.includes("canAccessWorkspaceHref(landing.persona, '/monitoring', landing.organizationRole)"), 'Agent Detail monitoring navigation must derive from workspace policy')
assert.ok(detail.includes('canAgents ? <Link href={canonicalRoutes.agents}'), 'Agent Detail Agents CTA must fail closed')
assert.ok(detail.includes('canMonitoring ? <Link href={canonicalRoutes.monitoring}'), 'Agent Detail monitoring CTA must fail closed')

assert.ok(run.includes("canAccessWorkspaceHref(landing.persona, '/agents', landing.organizationRole)"), 'Agent Run Agents navigation must derive from workspace policy')
assert.ok(run.includes('canAgents ? <Link href="/agents"'), 'Agent Run back-navigation must fail closed')

assert.ok(autonomy.includes("canAccessWorkspaceHref(landing.persona, '/agents', landing.organizationRole)"), 'Autonomous Governance Agents navigation must derive from workspace policy')
assert.ok(autonomy.includes("canAccessWorkspaceHref(landing.persona, '/monitoring', landing.organizationRole)"), 'Autonomous Governance monitoring navigation must derive from workspace policy')
assert.ok(autonomy.includes('canAgents ? <Link href="/agents"'), 'Autonomous Governance Agents CTA must fail closed')
assert.ok(autonomy.includes('canMonitoring ? <Link href="/monitoring"'), 'Autonomous Governance monitor CTA must fail closed')

for(const [label,text] of [['Dataset edit',dataset],['Source edit',source]]){
  assert.ok(text.includes("canAccessWorkspaceHref(landing.persona, '/datasets', landing.organizationRole)"), `${label} navigation must derive from workspace policy`)
  assert.ok(text.includes('canDatasets ?'), `${label} dataset navigation must fail closed`)
}

assert.ok(admin.includes("canAccessWorkspaceHref(landing.persona,'/admin',landing.organizationRole)"), 'Administration local navigation must derive from workspace policy')
assert.ok(admin.includes('canAdminWorkspace ? <div'), 'Administration local navigation must fail closed')
assert.ok(admin.includes('dataGovernanceSuperAdminOrganizationIds(user.id)'), 'Cleanup visibility must derive from Super Admin authority')
assert.ok(admin.includes('canCleanup ? <Link href="/admin/cleanup"'), 'Cleanup CTA must fail closed')

assert.ok(insights.includes("canAccessWorkspace(landing.persona, 'ai-capabilities', landing.organizationRole)"), 'AI Insights capability link must derive from workspace policy')
assert.ok(insights.includes("canAccessWorkspace(landing.persona, 'data-quality', landing.organizationRole)"), 'AI Insights DQ links must derive from workspace policy')
assert.ok(insights.includes('canAICapabilities ? <div className="flex justify-end">'), 'AI Insights capability CTA must fail closed')

console.log('Wave 13 local-navigation policy contract passed.')
