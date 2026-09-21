import assert from 'node:assert/strict'
import fs from 'node:fs'

const retrieval=fs.readFileSync('app/admin/ai-command-center/retrieval-evaluation/page.tsx','utf8')
const detail=fs.readFileSync('app/agents/[agentKey]/[version]/page.tsx','utf8')
const run=fs.readFileSync('app/agents/runs/[runId]/page.tsx','utf8')
const autonomous=fs.readFileSync('app/agents/autonomous-governance/page.tsx','utf8')
const insights=fs.readFileSync('app/ai-insights/page.tsx','utf8')
const dataset=fs.readFileSync('app/datasets/dataset/[datasetId]/edit/page.tsx','utf8')
const source=fs.readFileSync('app/datasets/edit/[sourceId]/page.tsx','utf8')
const admin=fs.readFileSync('app/admin/page.tsx','utf8')

assert.ok(retrieval.includes("canAccessWorkspaceHref(landing.persona, '/admin', landing.organizationRole)"), 'Retrieval Evaluation admin links must derive from workspace policy')
assert.ok(retrieval.includes('canAdminWorkspace ? <div'), 'Retrieval Evaluation admin links must fail closed')

assert.ok(detail.includes("canAccessWorkspaceHref(landing.persona, '/agents', landing.organizationRole)"), 'Agent Detail agent navigation must derive from workspace policy')
assert.ok(detail.includes("canAccessWorkspaceHref(landing.persona, '/monitoring', landing.organizationRole)"), 'Agent Detail monitoring navigation must derive from workspace policy')
assert.ok(detail.includes('canAgents ? <Link href={canonicalRoutes.agents}'), 'Agent Detail must hide agent actions when inaccessible')
assert.ok(detail.includes('canMonitoring ? <Link href={canonicalRoutes.monitoring}'), 'Agent Detail must hide monitoring when inaccessible')
assert.ok(detail.includes('Read-only run evidence'), 'Agent Detail must render a non-clickable evidence fallback when run navigation is unavailable')

assert.ok(run.includes("canAccessWorkspaceHref(landing.persona, '/agents', landing.organizationRole)"), 'Agent Run back-navigation must derive from workspace policy')
assert.ok(run.includes('canAgents ? <Link href="/agents"'), 'Agent Run must hide Agents navigation when inaccessible')

assert.ok(autonomous.includes("canAccessWorkspaceHref(landing.persona, '/agents', landing.organizationRole)"), 'Autonomous Governance Agents CTA must derive from workspace policy')
assert.ok(autonomous.includes("canAccessWorkspaceHref(landing.persona, '/monitoring', landing.organizationRole)"), 'Autonomous Governance Monitor CTA must derive from workspace policy')

assert.ok(insights.includes("canAccessWorkspace(landing.persona, 'ai-capabilities', landing.organizationRole)"), 'AI Insights AI-capability CTA must remain persona-gated')
assert.ok(insights.includes("canAccessWorkspace(landing.persona, 'data-quality', landing.organizationRole)"), 'AI Insights DQ CTA must remain persona-gated')

assert.ok(dataset.includes("canAccessWorkspaceHref(landing.persona, '/datasets', landing.organizationRole)"), 'Dataset editor back-navigation must derive from workspace policy')
assert.ok(source.includes("canAccessWorkspaceHref(landing.persona, '/datasets', landing.organizationRole)"), 'Source editor back-navigation must derive from workspace policy')
assert.ok(admin.includes("canAccessWorkspaceHref(landing.persona,'/admin',landing.organizationRole)"), 'Admin local navigation must derive from workspace policy')
assert.ok(admin.includes('canAdminWorkspace ? <div'), 'Admin local navigation must fail closed')

console.log('Wave 13 local-navigation policy contract passed.')
