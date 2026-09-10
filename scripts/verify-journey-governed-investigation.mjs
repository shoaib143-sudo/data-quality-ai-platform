import fs from 'node:fs'

const registry = fs.readFileSync('lib/agents/governed-agent-registry.ts', 'utf8')
const investigation = fs.readFileSync('lib/agents/governed-investigation.ts', 'utf8')
const specialist = fs.readFileSync('lib/agents/governance-specialist-agent.ts', 'utf8')
const governanceRoute = fs.readFileSync('app/api/agents/governance/run/route.ts', 'utf8')
const registryRoute = fs.readFileSync('app/api/agents/registry/route.ts', 'utf8')
const profilingRoute = fs.readFileSync('app/api/agents/run/route.ts', 'utf8')
const dqQueue = fs.readFileSync('lib/data-quality/queue.ts', 'utf8')
const readAgent = fs.readFileSync('lib/agents/governance-read-agent.ts', 'utf8')

const eightAgentKeys = [
  'profiling_agent',
  'data_quality_agent',
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
]
const sixSpecialists = [
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
]

const checks = [
  ['registry contains all eight authoritative agent keys', eightAgentKeys.every((key) => registry.includes(`'${key}'`))],
  ['registry declares the six shared governance specialists', sixSpecialists.every((key) => registry.includes(`'${key}'`)) && sixSpecialists.every((key) => readAgent.includes(`'${key}'`))],
  ['profiling keeps its hardened dedicated execution surface', registry.includes("executionSurface: '/api/agents/run'") && profilingRoute.includes("PRODUCTION_AGENT_KEY = 'profiling_agent'") && profilingRoute.includes('requireApiUser')],
  ['data quality keeps its hardened dedicated execution surface', registry.includes("executionSurface: '/api/data-quality/run'") && dqQueue.includes(".eq('agent_key', 'data_quality_agent')"))],
  ['governance specialists share one execution surface', registry.includes("executionSurface: '/api/agents/governance/run'")],
  ['read-only specialists cannot mutate governance or source state', registry.includes("authority: 'READ_ONLY_ADVISORY'") && registry.includes("mutationBoundary: 'READ_ONLY'")],
  ['profiling explicitly forbids source mutation', /profiling_agent:[\s\S]*mutationBoundary: 'NO_SOURCE_MUTATION'/.test(registry)],
  ['DQ mutations remain governed-workflow only', /data_quality_agent:[\s\S]*mutationBoundary: 'GOVERNED_WORKFLOW_ONLY'/.test(registry)],
  ['every role has a tool allowlist', (registry.match(/toolAllowlist:/g) ?? []).length === eightAgentKeys.length],
  ['every role has explicit handoff targets', (registry.match(/handoffTargets:/g) ?? []).length === eightAgentKeys.length],
  ['investigation contract is explicitly project scoped', investigation.includes('projectScoped: true') && investigation.includes("authorizationCapability: 'agent.execute'")),
  ['investigation separates authoritative, observed, proposed and reference evidence', ['AUTHORITATIVE', 'OBSERVED_EVIDENCE', 'PROPOSED_NON_AUTHORITATIVE', 'REFERENCE_CONTEXT'].every((value) => investigation.includes(`'${value}'`))],
  ['provenance carries source id authority and observation time', investigation.includes('ref: `${source}:${id}`') && investigation.includes('source,') && investigation.includes('authority: authorityFor(source, row)') && investigation.includes('observedAt: observedAt(row)')],
  ['investigation is bounded', investigation.includes('MAX_PROVENANCE_REFS = 1200') && investigation.includes('SOURCE_ROWS_PER_DOMAIN = 150') && investigation.includes('input.knowledgeMatches.slice(0, 20)') && investigation.includes('input.graph.edges.slice(0, 100)')],
  ['claim evidence IDs are checked against bundle provenance', investigation.includes('collectClaimEvidenceIds') && investigation.includes('unsupportedEvidenceIds') && investigation.includes("status: unsupportedEvidenceIds.length ? 'FAILED' : 'GROUNDED'"))],
  ['unsupported claim evidence fails closed', investigation.includes('assertGovernedInvestigationGrounding') && investigation.includes('Governed investigation contains unsupported evidence references'))],
  ['read-only investigation rejects mutation claims', investigation.includes('productionMutationPerformed: false') && investigation.includes('governanceMutationPerformed: false') && investigation.includes('cannot report a production or governance mutation'))],
  ['specialist builds shared investigation before output persistence', /const investigation = assertGovernedInvestigationGrounding\(buildGovernedInvestigation\([\s\S]*const output =/.test(specialist))],
  ['specialist includes governed role policy in output', specialist.includes('policy: agentPolicy')],
  ['specialist exposes shared investigation query plan and bundle', specialist.includes('sharedInvestigation: investigation.queryPlan') && specialist.includes('investigation,')],
  ['investigator embeds freshness evidence used by hypotheses', specialist.includes('alerts: freshnessAlerts.slice(0, 50)')],
  ['specialist audit records grounding evidence', specialist.includes('investigation_grounding_status') && specialist.includes('investigation_evidence_ref_count') && specialist.includes('investigation_referenced_evidence_count')],
  ['specialist evidence sources identify investigation contract', specialist.includes('governed_investigation.contract.v1')],
  ['governance agent API uses API-safe auth', governanceRoute.includes('requireApiUser') && !governanceRoute.includes('requireUser()')],
  ['governance agent API preserves agent.execute authorization', governanceRoute.includes("authorizeProject(user.id, projectId, 'agent.execute')")],
  ['eight-agent registry API uses API-safe auth', registryRoute.includes('requireApiUser') && !registryRoute.includes('requireUser()')],
  ['eight-agent registry API is project-authorized', registryRoute.includes("authorizeProject(user.id, projectId, 'agent.execute')")],
  ['registry API reports incomplete state instead of fabricating missing agents', registryRoute.includes("readiness: missingAgentKeys.length ? 'INCOMPLETE' : 'READY'") && registryRoute.includes('missingAgentKeys')],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Governed investigation journey verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}
console.log(`Governed investigation journey verification passed (${checks.length} checks).`)
