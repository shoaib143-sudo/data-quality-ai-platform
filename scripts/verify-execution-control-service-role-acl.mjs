import fs from 'node:fs'

const viewGrantPath = 'supabase/migrations/20260911043559_grant_service_role_ai_execution_control_effective_read.sql'
const eventsGrantPath = 'supabase/migrations/20260911043934_grant_service_role_ai_execution_control_events_read.sql'

const failures = []
for (const path of [viewGrantPath, eventsGrantPath]) {
  if (!fs.existsSync(path)) failures.push(`${path}: missing migration`)
}

if (!failures.length) {
  const viewGrant = fs.readFileSync(viewGrantPath, 'utf8').toLowerCase()
  const eventsGrant = fs.readFileSync(eventsGrantPath, 'utf8').toLowerCase()

  for (const role of ['public', 'anon', 'authenticated']) {
    if (!viewGrant.includes(`revoke all on governance.ai_execution_control_effective from public, anon, authenticated`)) {
      failures.push('execution-control effective view must explicitly revoke public, anon, authenticated before granting service_role')
      break
    }
  }
  if (!viewGrant.includes('grant select on governance.ai_execution_control_effective to service_role')) {
    failures.push('service_role must receive SELECT on governance.ai_execution_control_effective')
  }
  if (!eventsGrant.includes('grant select on governance.ai_execution_control_events to service_role')) {
    failures.push('service_role must receive SELECT on governance.ai_execution_control_events for the security-invoker view')
  }
  for (const forbidden of [' to public', ' to anon', ' to authenticated']) {
    if (eventsGrant.includes(forbidden)) failures.push(`execution-control event migration must not grant ${forbidden.trim()}`)
  }
}

if (failures.length) {
  console.error('Execution-control service-role ACL verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Execution-control security-invoker view and source-table service-role ACL contract verified.')
