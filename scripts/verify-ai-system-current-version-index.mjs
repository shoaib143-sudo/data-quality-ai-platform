import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260907110000_harden_ai_system_current_version_fk_index.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

if (!sql.includes('ai_systems_current_version_fk_idx')) {
  throw new Error('Missing required AI system current-version FK index')
}
if (!sql.includes('on governance.ai_systems (current_version_id)')) {
  throw new Error('Missing exact ai_systems.current_version_id FK coverage')
}
if (/drop\s+index|drop\s+constraint|alter\s+table[\s\S]*drop/i.test(sql)) {
  throw new Error('AI system current-version FK hardening must be additive and non-destructive')
}

console.log('AI system current-version FK index contract verified without changing AI system lifecycle authority.')
