import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260906161700_harden_autonomy_event_policy_fk_indexes.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

const required = [
  'autonomy_action_events_action_fk_idx',
  'autonomy_action_events_policy_version_fk_idx',
  'autonomy_actions_policy_version_fk_idx',
]
for (const index of required) {
  if (!sql.includes(index)) throw new Error(`Missing required autonomy FK index: ${index}`)
}
const clauses = [
  'on governance.autonomy_action_events (autonomy_action_id)',
  'on governance.autonomy_action_events (policy_version_id)',
  'on governance.autonomy_actions (policy_version_id)',
]
for (const clause of clauses) {
  if (!sql.includes(clause)) throw new Error(`Missing exact autonomy FK coverage: ${clause}`)
}
if (/drop\s+index|drop\s+constraint|alter\s+table[\s\S]*drop/i.test(sql)) {
  throw new Error('Autonomy FK hardening must be additive and non-destructive')
}
console.log('Autonomy event/policy FK index contract verified without changing autonomy authority.')
