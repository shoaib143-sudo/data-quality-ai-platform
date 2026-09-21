import assert from 'node:assert/strict'
import fs from 'node:fs'

const approvals = fs.readFileSync('app/approvals/page.tsx', 'utf8')
const workflows = fs.readFileSync('app/workflows/page.tsx', 'utf8')

for (const [name, source, role] of [
  ['Approvals', approvals, 'Approvals'],
  ['Governance Workflows', workflows, 'Governance Workflows'],
]) {
  assert.ok(source.includes('<GlobalUtilityBar'), `${name} must use the shared Product Shell`)
  assert.ok(source.includes(`roleLabel="${role}"`), `${name} must preserve its local shell context`)
  assert.ok(source.includes('id="main-content"'), `${name} must expose the shared skip-link target`)
}

assert.ok(approvals.includes("canAccessWorkspace(landing.persona, 'agents'"), 'Approvals Agents CTA must be persona gated')
assert.ok(approvals.includes("canAccessWorkspace(landing.persona, 'monitoring'"), 'Approvals Job Monitor CTA must be persona gated')
assert.ok(approvals.includes('canAgents ? <Link href="/agents"'), 'Approvals must not render Agents when inaccessible')
assert.ok(approvals.includes('canMonitoring ? <Link href="/monitoring"'), 'Approvals must not render Job Monitor when inaccessible')
assert.ok(workflows.includes("canAccessWorkspace(landing.persona,'issues'"), 'Workflow Issues CTA must be persona gated')
assert.ok(workflows.includes("canAccessWorkspace(landing.persona,'profiling'"), 'Workflow profiling CTA must be persona gated')
assert.ok(workflows.includes("canAccessWorkspace(landing.persona,'journeys'"), 'Workflow Governance Runs CTA must be persona gated')
assert.ok(workflows.includes('canIssues?<Link href="/issues"'), 'Workflow Issues link must honor access')
assert.ok(workflows.includes('canProfiling?<Link href="/profiling/explorer"'), 'Workflow profiling link must honor access')
assert.ok(workflows.includes('canJourneys?<Link href="/journeys"'), 'Workflow Governance Runs link must honor access')
assert.ok(!workflows.includes('DataNexus AI</Link>'), 'Workflow page must not retain a duplicate legacy brand shell')

console.log('Wave 3 Approvals and Workflows Product Shell contract passed.')
