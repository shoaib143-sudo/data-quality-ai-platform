import assert from 'node:assert/strict'
import fs from 'node:fs'

const catalog = fs.readFileSync('app/catalog/page.tsx', 'utf8')
const issues = fs.readFileSync('app/issues/page.tsx', 'utf8')
const quality = fs.readFileSync('app/data-quality/page.tsx', 'utf8')
const reports = fs.readFileSync('app/reports/page.tsx', 'utf8')
const agents = fs.readFileSync('app/agents/page.tsx', 'utf8')
const ai = fs.readFileSync('app/ai-capabilities/page.tsx', 'utf8')
const learningCases = fs.readFileSync('app/admin/learning-cases/page.tsx', 'utf8')

assert.ok(catalog.includes("canAccessWorkspace(landing.persona,'discovery'"), 'Catalog Discovery CTA must derive from workspace policy')
assert.ok(catalog.includes("canAccessWorkspace(landing.persona,'glossary'"), 'Catalog Glossary CTA must derive from workspace policy')
assert.ok(catalog.includes('canDiscover?<Link href="/catalog/discovery"'), 'Catalog Discovery CTA must fail closed')
assert.ok(catalog.includes('canGlossary?<Link href="/glossary"'), 'Catalog Glossary CTA must fail closed')

assert.ok(issues.includes("canAccessWorkspace(landing.persona, 'data-quality'"), 'Issues Data Quality CTA must derive from workspace policy')
assert.ok(issues.includes("canAccessWorkspace(landing.persona, 'profiling'"), 'Issues profiling CTA must derive from workspace policy')
assert.ok(issues.includes('canProfiling && presentation.showProfilingEvidence ? <Link href="/profiling/explorer"'), 'Issues profiling CTA must fail closed')
assert.ok(issues.includes('canDataQuality ? <Link href="/data-quality"'), 'Issues Data Quality CTA must fail closed')

assert.ok(quality.includes("canAccessWorkspace(landing.persona, 'profiling'"), 'Data Quality profiling CTA must derive from workspace policy')
assert.ok(quality.includes("canAccessWorkspace(landing.persona, 'observability'"), 'Data Quality observability CTA must derive from workspace policy')
assert.ok(quality.includes('canProfiling ? <Link href="/profiling/explorer"'), 'Data Quality local profiling CTA must fail closed')
assert.ok(quality.includes('canObservability ? <Link href="/observability"'), 'Data Quality Observability CTA must fail closed')

assert.ok(reports.includes("canAccessWorkspace(landing.persona,'catalog'"), 'Reports Catalog CTA must derive from workspace policy')
assert.ok(reports.includes("canAccessWorkspace(landing.persona,'observability'"), 'Reports Observability CTA must derive from workspace policy')
assert.ok(reports.includes("canAccessWorkspace(landing.persona,'audit'"), 'Reports Audit CTA must derive from workspace policy')
assert.ok(reports.includes('canCatalog?<Link href="/catalog"'), 'Reports Catalog CTA must fail closed')
assert.ok(reports.includes('canObservability?<Link href="/observability"'), 'Reports Observability CTA must fail closed')
assert.ok(reports.includes('canAudit?<Link href="/audit"'), 'Reports Audit CTA must fail closed')

assert.ok(agents.includes("canAccessWorkspace(accessContext.persona, 'monitoring'"), 'Agents Job Monitor CTA must derive from workspace policy')
assert.ok(agents.includes('canMonitoring ? <Link href={canonicalRoutes.monitoring}'), 'Agents Job Monitor CTA must fail closed')
assert.ok(agents.includes('governanceSuperAdmin ? <Link href="/admin/learning-cases"'), 'learning-case navigation must remain super-admin gated')
assert.ok(learningCases.includes('authorizeDataGovernanceSuperAdminForOrganization(user.id, membership.organizationId)'), 'learning-case administration must remain server-side super-admin gated')

assert.ok(ai.includes("canAccessWorkspaceHref(landing.persona, '/ai-insights'"), 'AI Capabilities must use canonical href policy for AI Insights')
assert.ok(ai.includes('canAiInsights ? <Link href="/ai-insights"'), 'AI Insights CTA must fail closed through the href policy')
assert.ok(!ai.includes("canAccessWorkspace(landing.persona, 'ai-insights'"), 'AI Insights must not invent a non-existent workspace key')

console.log('Wave 4 local navigation policy contract passed.')
