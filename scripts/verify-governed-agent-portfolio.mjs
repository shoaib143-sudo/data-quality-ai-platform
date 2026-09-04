import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing governed-agent artifact: ${path}`)
  return fs.readFileSync(path, 'utf8')
}

function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (!source.includes(pattern)) throw new Error(`${path} is missing governed-agent contract: ${pattern}`)
  }
}

const agentKeys = [
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
]

requireText('lib/auth/authorize.ts', ["'agent.execute'"])
requireText('supabase/migrations/20260904190310_add_governed_agent_execution_capability.sql', [
  "'agent.execute'",
  "'DATA_OWNER'",
  "'DATA_STEWARD'",
  "'QUALITY_MANAGER'",
  "'POLICY_APPROVER'",
])
requireText('supabase/migrations/20260904190520_register_governance_read_agents.sql', [
  ...agentKeys,
  'read_project_snapshot',
  "'read_only',true",
  "'mutation_allowed',false",
])
requireText('lib/agents/governance-read-agent.ts', [
  ...agentKeys,
  "status: 'RUNNING'",
  "status: 'SUCCEEDED'",
  "status: 'FAILED'",
  'GOVERNED_READ_AGENT_COMPLETED',
  "mode: 'deterministic_read_only'",
])
requireText('app/api/agents/governance/run/route.ts', [
  "authorizeProject(user.id, projectId, 'agent.execute')",
  'executeGovernanceReadAgent',
  'GOVERNANCE_READ_AGENT_KEYS',
])

console.log('Governed agent portfolio contracts verified.')
