import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260907100000_harden_autonomy_policy_version_fk_indexes.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

const required = [
  'autonomy_policies_current_version_fk_idx',
  'autonomy_policies_reviewed_by_fk_idx',
  'autonomy_policy_versions_project_fk_idx',
]
for (const index of required) {
  if (!sql.includes(index)) throw new Error(`Missing required autonomy policy FK index: ${index}`)
}

const clauses = [
  'on governance.autonomy_policies (current_version_id)',
  'on governance.autonomy_policies (reviewed_by)',
  'on governance.autonomy_policy_versions (project_id)',
]
for (const clause of clauses) {
  if (!sql.includes(clause)) throw new Error(`Missing exact autonomy policy FK coverage: ${clause}`)
}

if (/drop\s+index|drop\s+constraint|alter\s+table[\s\S]*drop/i.test(sql)) {
  throw new Error('Autonomy policy FK hardening must be additive and non-destructive')
}

console.log('Autonomy policy/version FK index contract verified without changing policy authority.')
