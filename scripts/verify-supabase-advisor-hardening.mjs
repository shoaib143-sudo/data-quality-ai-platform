import fs from 'node:fs'

const first = fs.readFileSync('supabase/migrations/20260910210359_explicit_internal_service_rls_denies.sql', 'utf8')
const restrictive = fs.readFileSync('supabase/migrations/20260910210450_make_internal_service_rls_denies_restrictive.sql', 'utf8')

const internalTables = [
  'governance.ai_model_cost_events',
  'governance.embedding_spaces',
  'governance.governed_action_outcomes',
  'governance.landing_page_settings',
  'orchestration.job_dependencies',
  'orchestration.source_concurrency_state',
  'orchestration.worker_dispatch_state',
]

const checks = [
  ['all seven internal/service tables are explicitly covered', internalTables.every((table) => first.includes(`on ${table}`) && restrictive.includes(`on ${table}`))],
  ['client deny policy targets only anon/authenticated', first.includes('to anon, authenticated') && restrictive.includes('to anon, authenticated')],
  ['initial policy is fail closed', first.includes('using (false)') && first.includes('with check (false)')],
  ['final policies are restrictive', (restrictive.match(/as restrictive/g) ?? []).length === internalTables.length],
  ['final policies remain fail closed', (restrictive.match(/using \(false\)/g) ?? []).length === internalTables.length && (restrictive.match(/with check \(false\)/g) ?? []).length === internalTables.length],
  ['service_role is not targeted by deny policy', !first.includes('to service_role') && !restrictive.includes('to service_role')],
  ['released hardening is forward-only', !first.toLowerCase().includes('disable row level security') && !restrictive.toLowerCase().includes('disable row level security')],
]

const failures = checks.filter(([, passed]) => !passed)
for (const [name, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${name}`)
if (failures.length) {
  console.error(`Supabase advisor hardening verification failed: ${failures.map(([name]) => name).join(', ')}`)
  process.exit(1)
}

console.log(`Supabase advisor hardening contract passed (${checks.length} checks).`)
