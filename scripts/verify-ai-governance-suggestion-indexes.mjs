import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260906155600_harden_ai_governance_suggestion_fk_indexes.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

const required = [
  'ai_governance_suggestions_source_agent_run_fk_idx',
  'ai_governance_suggestions_source_artifact_fk_idx',
]

for (const index of required) {
  if (!sql.includes(index)) {
    throw new Error(`Missing required AI governance suggestion FK index: ${index}`)
  }
}

if (!sql.includes('on governance.ai_governance_suggestions (source_agent_run_id)')) {
  throw new Error('Source agent run FK index must lead with source_agent_run_id')
}
if (!sql.includes('on governance.ai_governance_suggestions (source_artifact_id)')) {
  throw new Error('Source artifact FK index must lead with source_artifact_id')
}
if (/drop\s+index|drop\s+constraint|alter\s+table[\s\S]*drop/i.test(sql)) {
  throw new Error('AI governance suggestion FK hardening must be additive and non-destructive')
}

console.log('AI governance suggestion FK index contract verified without changing suggestion authority.')
