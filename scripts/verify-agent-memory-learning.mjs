import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing agent memory/learning artifact: ${path}`)
  return fs.readFileSync(path, 'utf8')
}
function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) if (!source.includes(pattern)) throw new Error(`${path} is missing memory/learning contract: ${pattern}`)
}

requireText('supabase/migrations/20260904215057_agent_memory_learning_layers.sql', [
  'agent.agent_working_memory','agent.agent_memory_relationships','agent.agent_learning_cases',
  "'EPISODE'","'SEMANTIC'",'expire_working_memory','search_learning_cases','dgp-agent-working-memory-expiry',
  'enable row level security',
])
requireText('supabase/migrations/20260904215149_project_governance_learning_into_agent_cases.sql', [
  'project_remediation_knowledge_case','project_profiling_recommendation_case','project_dq_recommendation_case',
  'GOVERNANCE_REMEDIATION_KNOWLEDGE','PROFILING_RECOMMENDATION_LEARNING','DATA_QUALITY_RECOMMENDATION_LEARNING',
])
requireText('lib/agents/agent-memory.ts', [
  'persistAgentWorkingMemory','retrieveRelevantAgentMemory','EPISODE','SEMANTIC','agent_memory_relationships',
  'SYSTEM_CONTRACT','evidence_count','specialist_reasoning_contract',
])
requireText('lib/agents/governed-learning-context.ts', [
  'createGovernanceMemoryProvider', "classes: ['episodic']", 'verifiedEpisodes',
])
requireText('lib/agents/agent-memory-learning.ts', [
  'retrieveGovernedLearningContext','verifiedEpisodeMatches','verifiedEpisodes',
  'use_verified_prior_episodes_as_context: true','reuse_prior_recommendation_prose: false',
  'semantic_memory_requires_separate_authority_gate: true','interaction_context',
])
const activeLearning = read('lib/agents/agent-memory-learning.ts')
if (activeLearning.includes('PRIOR_LEARNING') || activeLearning.includes('item.recommendation') || activeLearning.includes('learnedRecommendations')) {
  throw new Error('Active governed agent learning must not recursively reuse prior recommendation prose.')
}
if (activeLearning.includes('retrieveRelevantAgentMemory')) {
  throw new Error('Active governed agent learning must not use permissive legacy learning-case retrieval as authority.')
}
requireText('app/api/agents/governance/run/route.ts', ['enrichGovernedAgentWithMemory','persistGovernedAgentMemoryAndEvaluation'])
requireText('app/api/agents/governance/handoff/route.ts', ['enrichGovernedAgentWithMemory','memory_informed: true'])
requireText('lib/governance/semantic-agent-learning-indexer.ts', ['AGENT_LEARNING_CASE','reindexProjectAgentLearningCases'])
requireText('lib/governance/semantic-job-worker.ts', ['reindexProjectAgentLearningCases','agentLearning.indexed'])

console.log('Layered agent memory and verified learning contracts verified.')
