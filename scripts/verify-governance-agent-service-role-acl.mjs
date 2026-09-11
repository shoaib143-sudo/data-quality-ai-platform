import fs from 'node:fs'

const intelligenceGrantPath = 'supabase/migrations/20260911045601_grant_service_role_governance_control_intelligence_reads.sql'
const definitionsGrantPath = 'supabase/migrations/20260911050028_grant_service_role_governance_control_definitions_read.sql'
const failures = []

for (const path of [intelligenceGrantPath, definitionsGrantPath]) {
  if (!fs.existsSync(path)) failures.push(`${path}: missing migration`)
}

if (!failures.length) {
  const intelligenceGrant = fs.readFileSync(intelligenceGrantPath, 'utf8').toLowerCase()
  const definitionsGrant = fs.readFileSync(definitionsGrantPath, 'utf8').toLowerCase()
  const combined = `${intelligenceGrant}\n${definitionsGrant}`

  if (!intelligenceGrant.includes('grant select on table governance.control_definitions to service_role')) {
    failures.push('live-history migration must grant service_role SELECT on governance.control_definitions')
  }
  if (!intelligenceGrant.includes('grant select on table governance.governance_findings to service_role')) {
    failures.push('service_role must receive SELECT on governance.governance_findings')
  }
  if (!definitionsGrant.includes('grant select on governance.control_definitions to service_role')) {
    failures.push('reconciled reviewed migration must preserve service_role SELECT on governance.control_definitions')
  }

  for (const forbidden of ['grant insert', 'grant update', 'grant delete', 'grant truncate', 'grant references', 'grant trigger']) {
    if (combined.includes(forbidden)) failures.push(`migrations must not grant mutation privilege: ${forbidden}`)
  }
  for (const forbiddenRole of [' to public', ' to anon']) {
    if (combined.includes(forbiddenRole)) failures.push(`migrations must not grant new access to ${forbiddenRole.trim()}`)
  }
}

if (failures.length) {
  console.error('Governance-agent service-role ACL verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Governance-agent service-role control-definition and finding read contracts, including live migration history, verified.')
