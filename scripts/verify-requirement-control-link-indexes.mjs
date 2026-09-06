import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260907104500_harden_requirement_control_link_fk_indexes.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

const required = [
  'requirement_control_links_control_fk_idx',
  'requirement_control_links_requirement_fk_idx',
]
for (const index of required) {
  if (!sql.includes(index)) throw new Error(`Missing required requirement/control FK index: ${index}`)
}

const clauses = [
  'on governance.requirement_control_links (control_id)',
  'on governance.requirement_control_links (requirement_id)',
]
for (const clause of clauses) {
  if (!sql.includes(clause)) throw new Error(`Missing exact requirement/control FK coverage: ${clause}`)
}

if (/drop\s+index|drop\s+constraint|alter\s+table[\s\S]*drop/i.test(sql)) {
  throw new Error('Requirement/control FK hardening must be additive and non-destructive')
}

console.log('Requirement/control link FK index contract verified without changing governance control authority.')
