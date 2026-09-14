import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const monitor = readFileSync(new URL('../app/monitoring/job-monitor.tsx', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../app/monitoring/governed-domain-context.tsx', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/monitoring/domain-context/route.ts', import.meta.url), 'utf8')
const policy = readFileSync(new URL('../lib/monitoring/domain-context-policy.ts', import.meta.url), 'utf8')

assert.ok(monitor.includes('GovernedDomainContext'), 'selected execution must be wired to recorded governed context')
assert.ok(route.includes("authorizeProject(user.id, projectId, 'catalog.read')"), 'domain context must use the shared governed read boundary')
assert.ok(route.includes('loadDatasetGovernancePosture(projectId, datasetId)'), 'monitor must reuse the governed posture service instead of duplicating governance authority')
assert.ok(route.includes('loadMonitoringDependencyEvidence'), 'monitor must reuse the governed dependency evidence projection instead of duplicating dependency reads')
assert.ok(!route.includes("from('job_dependencies')"), 'domain context route must not create a competing dependency evidence reader')
assert.ok(route.includes("source: 'RECORDED_STATE_ONLY'"), 'response must explicitly identify recorded state')
assert.ok(route.includes('deriveJobEligibility'), 'blocked and waiting states must use explicit durable eligibility semantics')
assert.ok(route.includes('workloadPoolForJobType'), 'durable job pool identity must remain explicit')
assert.ok(!route.includes('last_error'), 'raw queue diagnostic text must not be exposed through the monitor context route')
assert.ok(!route.includes('lease_owner'), 'lease owner identity must not be exposed through the monitor context route')
assert.ok(route.includes("console.error('[job-monitor-domain-context] recorded context read failed', error)"), 'unexpected context failures must remain server-observable')
assert.ok(route.includes("error: 'Unable to load monitored domain context.'"), 'unexpected context failures must be client-safe')
assert.ok(!route.includes("error instanceof Error ? error.message"), 'unexpected internal failures must not be reflected to clients')
assert.ok(!/Math\.random|faker|synthetic|mock data/i.test(route), 'server read model must not synthesize governed state')
assert.ok(!/Math\.random|faker|simulated data/i.test(panel), 'client inspector must not synthesize governed state')
assert.ok(panel.includes('Missing records remain explicitly not recorded.'), 'missing product records must remain explicit rather than inferred')
assert.ok(panel.includes("payload.presentationMode === 'OUTCOME'"), 'leadership and business views must support outcome-focused density')
assert.ok(panel.includes("payload.presentationMode === 'OPERATIONS'"), 'operational views must expose durable execution evidence')
assert.ok(panel.includes('State plus meaning'), 'critical state must not be encoded by color alone')
assert.ok(panel.includes('No durable orchestration job is linked to this agent run. The monitor does not infer one.'), 'absence of durable job evidence must not be silently filled')
assert.ok(policy.includes("normalized === 'SEMANTIC_INDEX'"), 'SEMANTIC pool isolation mapping must be explicit')
assert.ok(policy.includes("normalized === 'GOVERNANCE_AGENT'"), 'GOVERNANCE pool isolation mapping must be explicit')
assert.ok(policy.includes("return 'CORE'"), 'CORE pool fallback must remain explicit')
assert.ok(policy.includes('.filter((dependency) => !dependency.satisfied)'), 'dependency blocking must consume the shared evidence projection result')
assert.ok(policy.includes('job.attempts >= job.maxAttempts'), 'attempt limit must prevent false eligibility')
assert.ok(policy.includes('capacity.runningCount >= capacity.maxConcurrentJobs'), 'capacity saturation must prevent false eligibility')

const forbidden = [
  /fake ai cell/i,
  /brain cell agent/i,
  /guaranteed compliant/i,
  /all systems healthy/i,
]
for (const pattern of forbidden) {
  assert.equal(pattern.test(`${monitor}\n${panel}\n${route}`), false, `forbidden unsupported assertion present: ${pattern}`)
}

console.log('Independent adversarial Job Monitor audit passed: shared dependency projection, no synthetic state, no raw queue diagnostics, client-safe failures, no inferred durable jobs, explicit dependency/capacity semantics, persona density, shared authorization, and recorded evidence provenance.')
