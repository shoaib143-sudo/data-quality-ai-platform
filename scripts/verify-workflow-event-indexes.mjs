import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260906161300_harden_workflow_event_project_fk_index.sql'
const sql = fs.readFileSync(migrationPath, 'utf8')

if (!sql.includes('workflow_instance_events_project_fk_idx')) {
  throw new Error('Missing workflow instance event project FK index')
}
if (!sql.includes('on governance.workflow_instance_events (project_id)')) {
  throw new Error('Workflow event project FK index must lead with project_id')
}
if (/drop\s+index|drop\s+constraint|alter\s+table[\s\S]*drop/i.test(sql)) {
  throw new Error('Workflow event FK hardening must be additive and non-destructive')
}

console.log('Workflow event project FK index contract verified without changing workflow authority.')
