import fs from 'node:fs'

const initial = fs.readFileSync('supabase/migrations/20260915072214_explicit_deny_rls_no_policy_tables.sql', 'utf8')
const restrictive = fs.readFileSync('supabase/migrations/20260915072330_make_explicit_deny_rls_no_policy_tables_restrictive.sql', 'utf8')

const tables = [
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
  ['all advisor targets are covered in both migrations', tables.every((table) => initial.includes(`on ${table}`) && restrictive.includes(`on ${table}`))],
  ['initial client policy is fail closed', (initial.match(/using \(false\)/g) ?? []).length === tables.length && (initial.match(/with check \(false\)/g) ?? []).length === tables.length],
  ['restrictive policy is fail closed', (restrictive.match(/using \(false\)/g) ?? []).length === tables.length && (restrictive.match(/with check \(false\)/g) ?? []).length === tables.length],
  ['all final policies are restrictive', (restrictive.match(/as restrictive/g) ?? []).length === tables.length],
  ['only client roles are denied', initial.includes('to anon, authenticated') && restrictive.includes('to anon, authenticated') && !initial.includes('to service_role') && !restrictive.includes('to service_role')],
  ['hardening remains forward only', !initial.toLowerCase().includes('disable row level security') && !restrictive.toLowerCase().includes('disable row level security')],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Explicit RLS deny verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}

console.log(`Explicit RLS deny contract passed (${checks.length} checks across ${tables.length} tables).`)
