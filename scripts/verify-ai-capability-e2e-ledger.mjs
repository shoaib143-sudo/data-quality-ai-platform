import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260908102000_ai_capability_e2e_execution_ledger.sql', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Missing ${label}: ${needle}`)
}

requireText(migration, 'create table if not exists governance.ai_capability_e2e_runs', 'run ledger')
requireText(migration, 'create table if not exists governance.ai_capability_e2e_run_datasets', 'run dataset scope')
requireText(migration, 'create table if not exists governance.ai_capability_e2e_results', '75-result ledger')
requireText(migration, "execution_status in ('NOT_RUN','EXECUTED','BLOCKED','EVIDENCED_ONLY','FAILED')", 'execution status contract')
requireText(migration, "if p_execution_status = 'EXECUTED' and v_count = 0", 'run-scoped evidence requirement')
requireText(migration, "raise exception 'EXECUTED requires at least one run-scoped evidence reference'", 'no evidence-free execution')
requireText(migration, "if p_execution_status = 'BLOCKED'", 'blocker contract')
requireText(migration, "raise exception 'BLOCKED requires blocker_code'", 'blocker reason requirement')
requireText(migration, 'from governance.generate_ai_capability_matrix(p_project_id)', 'canonical 75 capability names/domains')
requireText(migration, "<> 75", 'exact 75 row invariant')
requireText(migration, 'all dataset versions must belong to the requested project', 'scope isolation')
requireText(migration, 'Project-wide evidence must not be promoted to EXECUTED without run-scoped evidence references.', 'truth boundary comment')
requireText(migration, 'enable row level security', 'RLS')
requireText(migration, 'to service_role', 'service role boundary')

if (/grant\s+.*authenticated/i.test(migration)) throw new Error('E2E execution ledger must not grant authenticated users direct table/function mutation access.')
if (/grant\s+.*anon/i.test(migration)) throw new Error('E2E execution ledger must not grant anon users direct table/function mutation access.')

console.log('AI capability E2E ledger contract verified.')
