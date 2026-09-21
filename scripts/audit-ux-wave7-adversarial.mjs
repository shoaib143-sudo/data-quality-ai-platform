import assert from 'node:assert/strict'
import fs from 'node:fs'

const profilingPage = fs.readFileSync('app/profiling/page.tsx', 'utf8')
const profilingDashboard = fs.readFileSync('app/profiling/profiling-dashboard.tsx', 'utf8')
const resource = fs.readFileSync('app/resource-access/page.tsx', 'utf8')
const retention = fs.readFileSync('app/retention/page.tsx', 'utf8')
const scorecards = fs.readFileSync('app/scorecards/page.tsx', 'utf8')
const settings = fs.readFileSync('app/settings/page.tsx', 'utf8')
const platform = fs.readFileSync('app/platform/page.tsx', 'utf8')

for (const [name, source] of [
  ['profiling empty state', profilingPage],
  ['profiling dashboard', profilingDashboard],
  ['resource access', resource],
  ['retention', retention],
  ['scorecards', scorecards],
  ['settings', settings],
  ['platform', platform],
]) {
  assert.ok(source.includes('<GlobalUtilityBar'), 'adversarial: ' + name + ' must not regress to an isolated shell')
}

assert.ok(profilingDashboard.includes('canExplorer ? <Link href='), 'adversarial: Profiling Explorer deep links must fail closed')
assert.ok(!profilingDashboard.includes("@/lib/governance/workspace-access"), 'adversarial: client Profiling Dashboard must not import server-linked workspace access helpers')
assert.ok(!profilingDashboard.includes("@/lib/supabase/server"), 'adversarial: client Profiling Dashboard must not import server-only Supabase helpers')
assert.ok(profilingPage.includes('canExplorer={canExplorer}'), 'adversarial: server-resolved explorer access must be passed to the client dashboard')
assert.ok(profilingDashboard.includes('/profiling/explorer?runId='), 'adversarial: Profiling Explorer deep-link target must remain canonical')
assert.ok(resource.includes('{canApprovals ? <Link href="/approvals"'), 'adversarial: Resource Access must not expose Approvals without policy access')
assert.ok(retention.includes('canAdmin?<Link href="/admin"'), 'adversarial: Retention must not expose Admin without policy access')
assert.ok(scorecards.includes('canQuality?<Link href="/data-quality"'), 'adversarial: Scorecards must not expose Data Quality without policy access')
assert.ok(settings.includes('{canMonitoring ? <Link href="/monitoring"'), 'adversarial: Settings must not expose Job Monitor without policy access')
assert.ok(platform.includes('canOpenOrgAdmin&&canAdminWorkspace?<Link href="/admin"'), 'adversarial: Platform Admin requires both organization authority and workspace policy')

assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(profilingPage), 'adversarial: Profiling page shell migration must remain read only')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(scorecards), 'adversarial: Scorecards page shell migration must remain read only')
assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(settings), 'adversarial: Settings page shell migration must not add direct persistence mutations')

console.log('Independent Wave 7 UX adversarial audit passed.')