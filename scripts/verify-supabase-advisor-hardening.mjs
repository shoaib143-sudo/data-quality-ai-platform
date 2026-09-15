import fs from 'node:fs'

const first = fs.readFileSync('supabase/migrations/20260910210359_explicit_internal_service_rls_denies.sql', 'utf8')
const restrictive = fs.readFileSync('supabase/migrations/20260910210450_make_internal_service_rls_denies_restrictive.sql', 'utf8')
const advisorFirst = fs.readFileSync('supabase/migrations/20260915072214_explicit_deny_rls_no_policy_tables.sql', 'utf8')
const advisorRestrictive = fs.readFileSync('supabase/migrations/20260915072330_make_explicit_deny_rls_no_policy_tables_restrictive.sql', 'utf8')

const internalTables = [
  'governance.ai_model_cost_events',
  'governance.embedding_spaces',
  'governance.governed_action_outcomes',
  'governance.landing_page_settings',
  'orchestration.job_dependencies',
  'orchestration.source_concurrency_state',
  'orchestration.worker_dispatch_state',
]

const advisorTables = [
  'agent.agent_run_runtime_manifests',
  'agent.evidence_legal_holds',
  'agent.evidence_retention_policies',
  'app.release_assurance_evidence',
  'governance.agent_approval_authorities',
  'governance.agent_approval_decisions',
  'governance.agent_approval_delegations',
  'governance.agent_approval_notification_outbox',
  'governance.agent_approval_requests',
  'governance.agent_conversation_overrides',
  'governance.ai_red_team_evidence',
  'governance.analysis_evidence_envelopes',
  'governance.learning_case_assessments',
  'governance.metric_definition_versions',
  'governance.project_agent_policy_context',
  'governance.resource_access_grants',
]

const checks = [
  ['all seven internal/service tables are explicitly covered', internalTables.every((table) => first.includes(`on ${table}`) && restrictive.includes(`on ${table}`))],
  ['client deny policy targets only anon/authenticated', first.includes('to anon, authenticated') && restrictive.includes('to anon, authenticated')],
  ['initial policy is fail closed', first.includes('using (false)') && first.includes('with check (false)')],
  ['final policies are restrictive', (restrictive.match(/as restrictive/g) ?? []).length === internalTables.length],
  ['final policies remain fail closed', (restrictive.match(/using \(false\)/g) ?? []).length === internalTables.length && (restrictive.match(/with check \(false\)/g) ?? []).length === internalTables.length],
  ['service_role is not targeted by deny policy', !first.includes('to service_role') && !restrictive.includes('to service_role')],
  ['released hardening is forward-only', !first.toLowerCase().includes('disable row level security') && !restrictive.toLowerCase().includes('disable row level security')],
  ['all advisor RLS-only tables are explicitly covered', advisorTables.every((table) => advisorFirst.includes(`on ${table}`) && advisorRestrictive.includes(`on ${table}`))],
  ['advisor client deny policy targets only anon/authenticated', advisorFirst.includes('to anon, authenticated') && advisorRestrictive.includes('to anon, authenticated')],
  ['advisor initial policies are fail closed', (advisorFirst.match(/using \(false\)/g) ?? []).length === advisorTables.length && (advisorFirst.match(/with check \(false\)/g) ?? []).length === advisorTables.length],
  ['advisor final policies are restrictive', (advisorRestrictive.match(/as restrictive/g) ?? []).length === advisorTables.length],
  ['advisor final policies remain fail closed', (advisorRestrictive.match(/using \(false\)/g) ?? []).length === advisorTables.length && (advisorRestrictive.match(/with check \(false\)/g) ?? []).length === advisorTables.length],
  ['advisor deny policies never target service_role', !advisorFirst.includes('to service_role') && !advisorRestrictive.includes('to service_role')],
  ['advisor hardening never disables RLS', !advisorFirst.toLowerCase().includes('disable row level security') && !advisorRestrictive.toLowerCase().includes('disable row level security')],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Supabase advisor hardening verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}

console.log(`Supabase advisor hardening contract passed (${checks.length} checks).`)
