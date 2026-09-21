import assert from 'node:assert/strict'
import fs from 'node:fs'

const catalog = fs.readFileSync('app/catalog/page.tsx', 'utf8')
const issues = fs.readFileSync('app/issues/page.tsx', 'utf8')
const quality = fs.readFileSync('app/data-quality/page.tsx', 'utf8')
const reports = fs.readFileSync('app/reports/page.tsx', 'utf8')
const agents = fs.readFileSync('app/agents/page.tsx', 'utf8')
const ai = fs.readFileSync('app/ai-capabilities/page.tsx', 'utf8')

for (const [name, source] of [
  ['catalog', catalog],
  ['issues', issues],
  ['data quality', quality],
  ['reports', reports],
  ['agents', agents],
  ['AI capabilities', ai],
]) {
  assert.ok(source.includes('<GlobalUtilityBar'), 'adversarial: ' + name + ' must not regress to an isolated shell')
  assert.ok(source.includes('organizationRole='), 'adversarial: ' + name + ' shell must receive organization-role context')
}

assert.ok(catalog.includes('canDiscover?<Link href="/catalog/discovery"'), 'adversarial: Catalog must not expose discovery without policy access')
assert.ok(issues.includes('canDataQuality ? <Link href="/data-quality"'), 'adversarial: Issues must not expose Data Quality without policy access')
assert.ok(quality.includes('canObservability ? <Link href="/observability"'), 'adversarial: Data Quality must not expose Observability without policy access')
assert.ok(reports.includes('canAudit?<Link href="/audit"'), 'adversarial: Reports must not expose Audit without policy access')
assert.ok(agents.includes('canMonitoring ? <Link href={canonicalRoutes.monitoring}'), 'adversarial: Agents must not expose monitoring without policy access')
assert.ok(ai.includes("canAccessWorkspaceHref(landing.persona, '/ai-insights'"), 'adversarial: AI Insights access must use canonical href policy')
assert.ok(!ai.includes("canAccessWorkspace(landing.persona, 'ai-insights'"), 'adversarial: a fake AI Insights workspace key must never be introduced')

for (const source of [catalog, issues, quality, reports, agents, ai]) {
  assert.ok(!/\.insert\s*\(|\.update\s*\(|\.delete\s*\(|\.upsert\s*\(/.test(source), 'adversarial: shell integration pages must not gain direct mutation authority')
}

console.log('Independent Wave 4 UX adversarial audit passed.')
