import fs from 'node:fs'
import assert from 'node:assert/strict'

const migration = fs.readFileSync('supabase/migrations/20260919123500_agent_policy_operational_capabilities.sql', 'utf8')
const authorization = fs.readFileSync('lib/governance/agent-authorization.ts', 'utf8')
const actions = fs.readFileSync('lib/monitoring/run-actions.ts', 'utf8')

for (const role of ['DATA_OWNER','DATA_STEWARD','DATA_GOVERNANCE_ADMIN','DATA_GOVERNANCE_SPECIALIST']) {
  assert.match(migration, new RegExp(`'${role}'`))
}
assert.match(migration, /array\['execution\.approve'\]/)
assert.match(migration, /array\['agent\.admin'\]/)
assert.match(migration, /role_key = 'DATA_GOVERNANCE_ADMIN'/)
assert.match(migration, /agent\.admin may only be assigned to DATA_GOVERNANCE_ADMIN/)
assert.match(migration, /execution\.approve has an unsupported role assignment/)

assert.match(authorization, /'execution\.approve': 'execution\.approve'/)
assert.match(authorization, /'agent\.admin': 'agent\.admin'/)
assert.match(actions, /APPROVE: 'execution\.approve'/)
assert.match(actions, /ADMIN: 'agent\.admin'/)

console.log('Agent Policy v2 operational capability coherence verified.')
