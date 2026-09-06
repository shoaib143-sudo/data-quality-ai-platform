import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260906160800_harden_control_scope_fk_indexes.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

const required = [
  'control_scope_bindings_control_fk_idx',
  'control_scope_bindings_data_source_fk_idx',
]
for (const index of required) {
  if (!sql.includes(index)) throw new Error(`Missing required control-scope FK index: ${index}`)
}
if (!sql.includes('on governance.control_scope_bindings (control_id)')) {
  throw new Error('Control FK index must lead with control_id')
}
if (!sql.includes('on governance.control_scope_bindings (data_source_id)')) {
  throw new Error('Data source FK index must lead with data_source_id')
}
if (/drop\s+index|drop\s+constraint|alter\s+table[\s\S]*drop/i.test(sql)) {
  throw new Error('Control-scope FK hardening must be additive and non-destructive')
}
console.log('Control-scope FK index contract verified without changing control authority.')
