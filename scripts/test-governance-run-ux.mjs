import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('app/journeys/[projectId]/page.tsx', 'utf8')
const overview = fs.readFileSync('app/journeys/page.tsx', 'utf8')
const routes = fs.readFileSync('lib/platform/canonical-routes.ts', 'utf8')
const contracts = fs.readFileSync('lib/platform/resource-route-contracts.mjs', 'utf8')

for (const stage of [
  'Source readiness',
  'Dataset discovery',
  'Profiling',
  'Quality assessment',
  'Findings',
  'Governance decision',
  'Remediation',
  'Verification',
  'Governance outcome',
  'Governed learning',
]) assert.ok(page.includes(stage), `Governance Run missing stage: ${stage}`)

assert.ok(page.includes("const user = await requireUser()"), 'Governance Run must authenticate')
assert.ok(page.includes("canAccessWorkspace(landing.persona, 'workflows'"), 'workflow CTA must respect persona workspace access')
assert.ok(page.includes("canAccessWorkspace(landing.persona, 'monitoring'"), 'monitor CTA must respect persona workspace access')
assert.ok(page.includes("canAccessWorkspace(landing.persona, 'reports'"), 'reports CTA must respect persona workspace access')
assert.ok(page.includes("canAccessWorkspace(landing.persona, 'ai-capabilities'"), 'learning CTA must respect persona workspace access')
assert.ok(page.includes(".eq('organization_id', landing.organizationId)"), 'Governance Run must enforce organization scope')
assert.ok(page.includes('if (!projectResult.data) notFound()'), 'Governance Run must fail closed for inaccessible projects')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(page), 'Governance Run must remain a read-only projection')
assert.ok(routes.includes('governanceRun(projectId: string)'), 'canonical Governance Run route must exist')
assert.ok(contracts.includes("id: 'governance-run'"), 'Governance Run dynamic route must be registered with navigation integrity')
assert.ok(overview.includes('canonicalRoutes.governanceRun(project.id)'), 'journey overview must link to Governance Run canonically')
assert.ok(overview.includes('const latestCompletedRun = completedRuns[0] ?? null'), 'journey overview must derive findings from the latest completed profile only')
assert.ok(overview.includes('findings.filter(finding => finding.profile_run_id === latestCompletedRun.id)'), 'historical findings must not contaminate the current remediation stage')
assert.ok(overview.includes('Boolean(latestCompletedRun) && highFindings.length === 0'), 'guided remediation completion must fail closed while high-priority findings remain')
for (const cta of ['Open Governance Run', 'Job Monitor', 'Approvals', 'Reports', 'Recommended next action']) {
  assert.ok(page.includes(cta) || overview.includes(cta), `Governance Run CTA missing: ${cta}`)
}
assert.ok(page.includes("'BLOCKED'"), 'Governance Run must expose blocked stage state')
assert.ok(page.includes("'IN_PROGRESS'"), 'Governance Run must expose in-progress stage state')
assert.ok(page.includes("'NOT_STARTED'"), 'Governance Run must expose not-started stage state')
assert.ok(page.includes("'OPTIONAL'"), 'Governance Run must distinguish optional learning from required lifecycle stages')
assert.ok(page.includes("String(version.id) === String(latestCompletedRun.dataset_version_id)"), 'Governance Run must correlate Dataset 360 context from the actual latest completed profile run')
console.log('Governance Run UX, route and failure-state contract passed.')