import fs from 'node:fs'

const failures = []
const routePath = 'app/api/agents/governance-orchestrator/handsfree-e2e/route.ts'
const gatePath = 'lib/auth/authorize-data-governance-admin.ts'
const authPath = 'lib/auth/require-api-user.ts'
const route = fs.readFileSync(routePath, 'utf8')
const gate = fs.readFileSync(gatePath, 'utf8')
const auth = fs.readFileSync(authPath, 'utf8')

for (const required of [
  'requireApiUser()',
  'authorizeDataGovernanceAdmin(user.id, projectId)',
  "approvalBypassAllowed: false",
  "authBypassAllowed: false",
]) {
  if (!route.includes(required)) failures.push(`${routePath} missing invariant: ${required}`)
}

for (const required of [
  "role_key', 'DATA_GOVERNANCE_ADMIN'",
  ".eq('active', true)",
  "throw new AuthorizationError('Data Governance Admin access is required.')",
]) {
  if (!gate.includes(required)) failures.push(`${gatePath} missing explicit super-admin gate: ${required}`)
}

for (const forbidden of [
  'x-test-user',
  'x-e2e-user',
  'x-certification-user',
  'E2E_BYPASS_AUTH',
  'CERTIFICATION_BYPASS_AUTH',
  'DISABLE_AUTH',
]) {
  if (route.includes(forbidden) || gate.includes(forbidden) || auth.includes(forbidden)) {
    failures.push(`Forbidden hands-free authentication bypass marker present: ${forbidden}`)
  }
}

if (route.includes("authorizeProject(user.id, projectId, 'agent.execute')")) {
  failures.push('Hands-free E2E initiation must not be authorized by ordinary agent.execute capability.')
}

if (failures.length) {
  console.error('Hands-free E2E Data Governance Admin contract failed:')
  for (const failure of failures) console.error(`- ${failure}`)
  process.exit(1)
}

console.log('Hands-free E2E admin contract verified: authenticated DATA_GOVERNANCE_ADMIN initiation only; auth and approval bypasses remain forbidden.')
