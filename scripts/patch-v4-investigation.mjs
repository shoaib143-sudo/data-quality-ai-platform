import fs from 'node:fs'

function replaceOnce(path, before, after) {
  const current = fs.readFileSync(path, 'utf8')
  if (current.includes(after)) return false
  if (!current.includes(before)) throw new Error(`Patch marker not found in ${path}: ${before.slice(0, 100)}`)
  fs.writeFileSync(path, current.replace(before, after))
  return true
}

const specialistPath = 'lib/agents/governance-specialist-agent.ts'
replaceOnce(
  specialistPath,
  "} from '@/lib/agents/governance-read-agent'\n",
  "} from '@/lib/agents/governance-read-agent'\nimport { getGovernedAgentPolicy } from '@/lib/agents/governed-agent-registry'\nimport { assertGovernedInvestigationGrounding, buildGovernedInvestigation } from '@/lib/agents/governed-investigation'\n",
)
replaceOnce(
  specialistPath,
  "        issues: ctx.issues.slice(0, 30),\n        anomalies: ctx.anomalies.slice(0, 50),",
  "        issues: ctx.issues.slice(0, 30),\n        alerts: freshnessAlerts.slice(0, 50),\n        anomalies: ctx.anomalies.slice(0, 50),",
)
replaceOnce(
  specialistPath,
  "    const specialized = roleEvidence(agentKey, ctx)\n    const evidenceSources = [",
  "    const specialized = roleEvidence(agentKey, ctx)\n    const agentPolicy = getGovernedAgentPolicy(agentKey)\n    const investigation = assertGovernedInvestigationGrounding(buildGovernedInvestigation({\n      projectId: input.projectId,\n      organizationId: projectResult.data.organization_id,\n      agentKey,\n      question: suppliedQuestion,\n      context: ctx,\n      specialist: specialized as Record<string, unknown>,\n      knowledgeMatches,\n      graph,\n    }))\n    const evidenceSources = [",
)
replaceOnce(
  specialistPath,
  "      agent: { key: agentKey, name: definition.name, version: definition.version },",
  "      agent: { key: agentKey, name: definition.name, version: definition.version, policy: agentPolicy },",
)
replaceOnce(
  specialistPath,
  "        historySignals: {",
  "        sharedInvestigation: investigation.queryPlan,\n        historySignals: {",
)
replaceOnce(
  specialistPath,
  "      knowledge: {\n        matches: knowledgeMatches.slice(0, 20),\n        graph: { anchor: graph.anchor, edges: graph.edges.slice(0, 100) },\n      },\n      confidence,",
  "      knowledge: {\n        matches: knowledgeMatches.slice(0, 20),\n        graph: { anchor: graph.anchor, edges: graph.edges.slice(0, 100) },\n      },\n      investigation,\n      confidence,",
)
replaceOnce(
  specialistPath,
  "      evidence_sources: evidenceSources,",
  "      evidence_sources: [...evidenceSources, 'governed_investigation.contract.v1'],",
)
replaceOnce(
  specialistPath,
  "        'Freshness currently uses completed profiling observation time as a proxy until source-native watermark telemetry is available.',",
  "        'Freshness currently uses completed profiling observation time as a proxy until source-native watermark telemetry is available.',\n        'Shared investigation provenance is project scoped and unsupported claim evidence fails the run before success is persisted.',",
)
replaceOnce(
  specialistPath,
  "        knowledge_match_count: knowledgeMatches.length,",
  "        knowledge_match_count: knowledgeMatches.length,\n        investigation_contract_version: investigation.contractVersion,\n        investigation_grounding_status: investigation.grounding.status,\n        investigation_evidence_ref_count: investigation.grounding.evidenceRefCount,\n        investigation_referenced_evidence_count: investigation.grounding.referencedEvidenceCount,",
)

const routePath = 'app/api/agents/governance/run/route.ts'
replaceOnce(
  routePath,
  "import { requireUser } from '@/lib/auth/require-user'",
  "import { requireApiUser } from '@/lib/auth/require-api-user'",
)
let route = fs.readFileSync(routePath, 'utf8')
if (route.includes('requireUser()')) {
  route = route.replaceAll('requireUser()', 'requireApiUser()')
  fs.writeFileSync(routePath, route)
}

const specialist = fs.readFileSync(specialistPath, 'utf8')
const route = fs.readFileSync(routePath, 'utf8')
for (const required of [
  'buildGovernedInvestigation',
  'assertGovernedInvestigationGrounding',
  'investigation_grounding_status',
  'governed_investigation.contract.v1',
  'alerts: freshnessAlerts.slice(0, 50)',
]) {
  if (!specialist.includes(required)) throw new Error(`V4 specialist patch incomplete: ${required}`)
}
if (!route.includes('requireApiUser') || route.includes('requireUser()')) throw new Error('V4 governance route auth patch incomplete')
console.log('V4 shared investigation specialist patch applied.')
