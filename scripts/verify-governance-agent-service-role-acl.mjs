import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260911050028_grant_service_role_governance_control_definitions_read.sql'
const failures = []

if (!fs.existsSync(migrationPath)) {
  failures.push(`${migrationPath}: missing migration`)
} else {
  const sql = fs.readFileSync(migrationPath, 'utf8').toLowerCase()
  if (!sql.includes('grant select on governance.control_definitions to service_role')) {
    failures.push('service_role must receive SELECT on governance.control_definitions')
  }
  for (const forbidden of ['grant insert', 'grant update', 'grant delete', 'grant truncate', 'grant references', 'grant trigger']) {
    if (sql.includes(forbidden)) failures.push(`migration must not grant mutation privilege: ${forbidden}`)
  }
  for (const forbiddenRole of [' to public', ' to anon']) {
    if (sql.includes(forbiddenRole)) failures.push(`migration must not grant new access to ${forbiddenRole.trim()}`)
  }
}

if (failures.length) {
  console.error('Governance-agent service-role ACL verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Governance-agent service-role control-definition read contract and live migration version verified.')
