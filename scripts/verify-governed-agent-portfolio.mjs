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
requireText('supabase/migrations/20260904191840_agent_memory_and_evaluation_foundation.sql', [
  'agent.agent_memories',
  'agent.agent_evaluations',
  'agent_memory_select',
  'agent_evaluation_select',
  'AGENT.MEMORY_CREATED',
  'AGENT.EVALUATION_CREATED',
  "status <> 'ACTIVE'",
])
requireText('supabase/migrations/20260904192455_expire_agent_memories.sql', [
  'expire_agent_memories',
  'dgp-agent-memory-expiry',
  "status='EXPIRED'",
])
requireText('lib/agents/agent-memory.ts', [
  'project_summary:',
  'SYSTEM_CONTRACT',
  'operational_contract',
  'read_only_boundary',
  'agent_memories',
  'agent_evaluations',
])
requireText('lib/governance/semantic-agent-memory-indexer.ts', [
  "objectType: 'AGENT_MEMORY'",
  "eq('status', 'ACTIVE')",
  'deleteSemanticObject',
  'agent_memories',
])
requireText('lib/governance/semantic-job-worker.ts', [
  'reindexProjectAgentMemories',
  'agentMemories.indexed',
  'agentMemories.pruned',
])
requireText('infra/data-plane/clickhouse/init/004_agent_intelligence_history.sql', [
  'agent_evaluation_history',
  'agent_memory_history',
  'AGENT.EVALUATION_CREATED',
  'AGENT.MEMORY_CREATED',
  'INTERVAL 730 DAY',
])
requireText('app/api/agents/governance/run/route.ts', [
  "authorizeProject(user.id, projectId, 'agent.execute')",
  'executeGovernanceReadAgent',
  'persistGovernedAgentMemoryAndEvaluation',
  'GOVERNANCE_READ_AGENT_KEYS',
])
requireText('app/api/agents/governance/handoff/route.ts', [
  "authorizeProject(user.id, projectId, 'agent.execute')",
  'GOVERNED_HANDOFF',
  'parent_run_id',
  'source_agent_run_id',
  'target_agent_run_id',
  'GOVERNED_AGENT_HANDOFF_COMPLETED',
])
requireText('app/api/agents/runs/[runId]/evaluation/route.ts', [
  "authorizeProject(user.id, run.project_id, 'agent.execute')",
  'USER_FEEDBACK:',
  'AGENT_RUN_USER_EVALUATED',
  "score must be between 0 and 1",
])
requireText('app/agents/run-agent-form.tsx', [
  'GOVERNED_READ_AGENT_KEYS',
  "endpoint = '/api/agents/governance/run'",
  'Not required for this agent',
  'Question or objective',
])

console.log('Governed agent portfolio contracts verified.')
