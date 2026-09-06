import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260907101500_harden_data_contract_event_fk_indexes.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

const required = [
  'data_contracts_current_version_fk_idx',
  'data_contract_version_events_contract_fk_idx',
  'data_contract_version_events_project_fk_idx',
  'data_contract_evaluation_events_contract_fk_idx',
  'data_contract_evaluation_events_contract_version_fk_idx',
  'data_contract_evaluation_events_profile_run_fk_idx',
  'data_contract_evaluation_events_project_fk_idx',
]
for (const index of required) {
  if (!sql.includes(index)) throw new Error(`Missing required data-contract FK index: ${index}`)
}

const clauses = [
  'on governance.data_contracts (current_version_id)',
  'on governance.data_contract_version_events (contract_id)',
  'on governance.data_contract_version_events (project_id)',
  'on governance.data_contract_evaluation_events (contract_id)',
  'on governance.data_contract_evaluation_events (contract_version_id)',
  'on governance.data_contract_evaluation_events (profile_run_id)',
  'on governance.data_contract_evaluation_events (project_id)',
]
for (const clause of clauses) {
  if (!sql.includes(clause)) throw new Error(`Missing exact data-contract FK coverage: ${clause}`)
}

if (/drop\s+index|drop\s+constraint|alter\s+table[\s\S]*drop/i.test(sql)) {
  throw new Error('Data-contract FK hardening must be additive and non-destructive')
}

console.log('Data-contract event FK index contract verified without changing contract authority.')
