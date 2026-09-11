import fs from 'node:fs'

const migrationPath = 'supabase/migrations/20260911045601_grant_service_role_governance_control_intelligence_reads.sql'
const sourcePath = 'lib/governance/ai-governance-intelligence.ts'
const failures = []

for (const path of [migrationPath, sourcePath]) {
  if (!fs.existsSync(path)) failures.push(`${path}: missing required file`)
}

if (!failures.length) {
  const migration = fs.readFileSync(migrationPath, 'utf8').toLowerCase()
  const source = fs.readFileSync(sourcePath, 'utf8')

  for (const table of ['control_definitions', 'governance_findings']) {
    if (!source.includes(`.from('${table}')`)) {
      failures.push(`governance intelligence source must read governance.${table}`)
    }
    if (!migration.includes(`grant select on table governance.${table} to service_role`)) {
      failures.push(`service_role must receive SELECT on governance.${table}`)
    }
  }

  const grantStatements = migration
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean)
  const expected = new Set([
    'grant select on table governance.control_definitions to service_role',
    'grant select on table governance.governance_findings to service_role',
  ])

  if (grantStatements.length !== expected.size || grantStatements.some((statement) => !expected.has(statement))) {
    failures.push('migration must contain only the two minimum service_role SELECT grants')
  }

  for (const forbidden of [' to public', ' to anon', 'grant insert', 'grant update', 'grant delete', 'grant all']) {
    if (migration.includes(forbidden)) failures.push(`migration contains forbidden privilege expansion: ${forbidden.trim()}`)
  }
}

if (failures.length) {
  console.error('Governance control-intelligence service-role ACL verification failed:')
  failures.forEach((failure) => console.error(`- ${failure}`))
  process.exit(1)
}

console.log('Governance control-intelligence worker read ACL is limited to service_role SELECT on the two required tables.')
