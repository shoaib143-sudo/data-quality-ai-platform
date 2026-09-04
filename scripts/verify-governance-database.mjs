import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !serviceRoleKey) {
  console.log('SKIP governance database verification: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(0)
}

const supabase = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
const { data: projects, error: projectsError } = await supabase.schema('app').from('projects').select('id,name').order('created_at')
if (projectsError) throw new Error(`Unable to enumerate projects: ${projectsError.message}`)

const { data: agents, error: agentsError } = await supabase.schema('agent').from('agent_definitions').select('agent_key,version,enabled').eq('enabled', true)
if (agentsError) throw new Error(`Unable to validate production agents: ${agentsError.message}`)
const enabledAgents = new Set((agents ?? []).map((agent) => `${agent.agent_key}:${agent.version}`))
for (const required of ['profiling_agent:2.0', 'data_quality_agent:1.0']) {
  if (!enabledAgents.has(required)) throw new Error(`Required production agent is not enabled: ${required}`)
  console.log(`PASS production agent ${required}`)
}

const { data: securityPosture, error: securityPostureError } = await supabase.schema('governance').rpc('verify_database_api_security_posture')
if (securityPostureError) throw new Error(`Unable to verify database API security posture: ${securityPostureError.message}`)
if (!securityPosture || typeof securityPosture !== 'object' || securityPosture.valid !== true) {
  throw new Error(`Database API security posture is invalid: ${JSON.stringify(securityPosture)}`)
}
if (securityPosture.app_private_exposed === true || Number(securityPosture.anonymous_rls_helper_execute_count ?? -1) !== 0) {
  throw new Error(`Private RLS helpers are exposed beyond the intended boundary: ${JSON.stringify(securityPosture)}`)
}
console.log('PASS PostgREST exposure and RLS helper security posture')

const { data: semanticPosture, error: semanticPostureError } = await supabase.schema('governance').rpc('verify_semantic_search_posture')
if (semanticPostureError) throw new Error(`Unable to verify semantic search posture: ${semanticPostureError.message}`)
if (!semanticPosture || typeof semanticPosture !== 'object' || semanticPosture.valid !== true) {
  throw new Error(`Semantic search posture is invalid: ${JSON.stringify(semanticPosture)}`)
}
if (semanticPosture.anonymous_execute === true || semanticPosture.match_security_invoker !== true) {
  throw new Error(`Semantic search execution boundary is unsafe: ${JSON.stringify(semanticPosture)}`)
}
console.log('PASS semantic governance vector, index, RLS and RPC posture')

for (const project of projects ?? []) {
  const { data: contractResult, error: contractError } = await supabase.schema('governance').rpc('run_platform_contract_checks', { p_project_id: project.id })
  if (contractError) throw new Error(`Platform contract checks failed to execute for ${project.name}: ${contractError.message}`)
  const contractStatus = contractResult && typeof contractResult === 'object' ? contractResult.status : null
  if (contractStatus !== 'PASSED') throw new Error(`Platform contract checks returned ${String(contractStatus)} for ${project.name}: ${JSON.stringify(contractResult)}`)
  console.log(`PASS platform contract checks ${project.name}`)

  const { data: scorecard, error: scorecardError } = await supabase.schema('governance').rpc('refresh_project_scorecard', { p_project_id: project.id })
  if (scorecardError) throw new Error(`Governance scorecard refresh failed for ${project.name}: ${scorecardError.message}`)
  const overall = Number(scorecard?.overall_score)
  if (!Number.isFinite(overall) || overall < 0 || overall > 1) throw new Error(`Governance scorecard is invalid for ${project.name}.`)
  console.log(`PASS evidence scorecard ${project.name} -> ${Math.round(overall * 100)}%`)
}

const [{ count: activeSources, error: sourceError }, { count: deadEvents, error: eventError }] = await Promise.all([
  supabase.schema('profiling').from('dataset_execution_sources').select('dataset_version_id', { count: 'exact', head: true }).eq('active', true),
  supabase.schema('orchestration').from('event_outbox').select('id', { count: 'exact', head: true }).eq('status', 'DEAD').gte('created_at', new Date(Date.now() - 24 * 60 * 60_000).toISOString()),
])
if (sourceError) throw new Error(`Unable to inspect execution sources: ${sourceError.message}`)
if (eventError) throw new Error(`Unable to inspect governance outbox: ${eventError.message}`)
console.log(`PASS active execution source inventory -> ${activeSources ?? 0} active bindings`)
if ((deadEvents ?? 0) > 0) throw new Error(`${deadEvents} governance outbox events reached DEAD state in the previous 24 hours.`)
console.log('PASS governance outbox has no recent DEAD events')

const { data: syntheticResult, error: syntheticError } = await supabase.schema('governance').rpc('run_synthetic_governance_integration_suite')
if (syntheticError) throw new Error(`Synthetic governance integration suite failed to execute: ${syntheticError.message}`)
if (!syntheticResult || typeof syntheticResult !== 'object' || syntheticResult.status !== 'PASSED') {
  throw new Error(`Synthetic governance integration suite returned ${String(syntheticResult?.status ?? 'UNKNOWN')}: ${JSON.stringify(syntheticResult)}`)
}
const syntheticChecks = syntheticResult.checks && typeof syntheticResult.checks === 'object' ? Object.entries(syntheticResult.checks) : []
const failedSyntheticChecks = syntheticChecks.filter(([, passed]) => passed !== true).map(([key]) => key)
if (failedSyntheticChecks.length) throw new Error(`Synthetic governance integration checks failed: ${failedSyntheticChecks.join(', ')}`)
console.log(`PASS synthetic governance integration suite -> ${syntheticChecks.length} cross-module checks`)

console.log('Governance database verification completed.')
