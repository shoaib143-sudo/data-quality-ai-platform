import assert from 'node:assert/strict'
import fs from 'node:fs'

const profilingPage = fs.readFileSync('app/profiling/page.tsx', 'utf8')
const profilingDashboard = fs.readFileSync('app/profiling/profiling-dashboard.tsx', 'utf8')
const resource = fs.readFileSync('app/resource-access/page.tsx', 'utf8')
const retention = fs.readFileSync('app/retention/page.tsx', 'utf8')
const scorecards = fs.readFileSync('app/scorecards/page.tsx', 'utf8')
const settings = fs.readFileSync('app/settings/page.tsx', 'utf8')
const platform = fs.readFileSync('app/platform/page.tsx', 'utf8')

assert.ok(profilingPage.includes("canAccessWorkspaceHref(landing.persona, '/datasets'"), 'Profiling empty-state Datasets CTA must derive from workspace policy')
assert.ok(profilingPage.includes('{canDatasets ? <Link href="/datasets"'), 'Profiling Datasets CTA must fail closed')
assert.ok(profilingDashboard.includes("canAccessWorkspaceHref(persona, '/monitoring'"), 'Profiling monitoring CTA must derive from workspace policy')
assert.ok(profilingDashboard.includes("canAccessWorkspaceHref(persona, '/data-quality'"), 'Profiling Data Quality CTA must derive from workspace policy')
assert.ok(profilingDashboard.includes("canAccessWorkspaceHref(persona, '/profiling/explorer'"), 'Profiling Explorer CTAs must derive from workspace policy')
assert.ok(profilingDashboard.includes('{canMonitoring ? <Link href="/monitoring"'), 'Profiling monitoring CTA must fail closed')
assert.ok(profilingDashboard.includes('{canQuality ? <Link href="/data-quality"'), 'Profiling Data Quality CTA must fail closed')

assert.ok(resource.includes("canAccessWorkspaceHref(landing.persona, '/approvals'"), 'Resource Access Approvals CTA must derive from workspace policy')
assert.ok(resource.includes("canAccessWorkspaceHref(landing.persona, '/monitoring'"), 'Resource Access monitoring CTA must derive from workspace policy')
assert.ok(resource.includes('{canApprovals ? <Link href="/approvals"'), 'Resource Access Approvals CTA must fail closed')
assert.ok(resource.includes('{canMonitoring ? <Link href="/monitoring"'), 'Resource Access monitoring CTA must fail closed')

for (const [name, route] of [['Admin','/admin'],['Audit','/audit'],['Reports','/reports']]) {
  assert.ok(retention.includes("canAccessWorkspaceHref(landing.persona,'" + route + "'"), 'Retention ' + name + ' CTA must derive from workspace policy')
}
assert.ok(retention.includes('canAdmin?<Link href="/admin"'), 'Retention Admin CTA must fail closed')
assert.ok(retention.includes('canAudit?<Link href="/audit"'), 'Retention Audit CTA must fail closed')
assert.ok(retention.includes('canReports?<Link href="/reports"'), 'Retention Reports CTA must fail closed')

for (const [name, route] of [['Catalog','/catalog'],['Data Quality','/data-quality'],['Reports','/reports']]) {
  assert.ok(scorecards.includes("canAccessWorkspaceHref(landing.persona,'" + route + "'"), 'Scorecards ' + name + ' CTA must derive from workspace policy')
}
assert.ok(scorecards.includes('canCatalog?<Link href="/catalog"'), 'Scorecards Catalog CTA must fail closed')
assert.ok(scorecards.includes('canQuality?<Link href="/data-quality"'), 'Scorecards Data Quality CTA must fail closed')
assert.ok(scorecards.includes('canReports?<Link href="/reports"'), 'Scorecards Reports CTA must fail closed')

assert.ok(settings.includes("canAccessWorkspaceHref(access.persona, '/monitoring'"), 'Settings Job Monitor CTA must derive from workspace policy')
assert.ok(settings.includes('{canMonitoring ? <Link href="/monitoring"'), 'Settings Job Monitor CTA must fail closed')

assert.ok(platform.includes("canAccessWorkspaceHref(landing.persona,'/monitoring'"), 'Platform monitoring CTA must derive from workspace policy')
assert.ok(platform.includes("canAccessWorkspaceHref(landing.persona,'/audit'"), 'Platform Audit CTA must derive from workspace policy')
assert.ok(platform.includes("canAccessWorkspaceHref(landing.persona,'/admin'"), 'Platform Admin CTA must derive from workspace policy')
assert.ok(platform.includes('canOpenOrgAdmin&&canAdminWorkspace?<Link href="/admin"'), 'Platform Admin CTA must require both org authority and workspace policy')

console.log('Wave 7 local navigation policy contract passed.')
