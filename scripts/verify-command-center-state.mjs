import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing Command Center artifact: ${path}`)
  return fs.readFileSync(path, 'utf8')
}
function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (!source.includes(pattern)) throw new Error(`${path} is missing Command Center contract: ${pattern}`)
  }
}

requireText('lib/ai/command-center-state.ts', [
  'GovernedCommandCenterState',
  'AI_SYSTEM_NOT_APPROVED',
  'AI_SYSTEM_CURRENT_VERSION_NO_APPROVAL',
  'AI_SYSTEM_ACTIVE_WITHOUT_APPROVAL',
  'AI_TELEMETRY_ERROR',
  'AUTO_POLICY_ENABLED',
  'AUTO_POLICY_NOT_REVIEWED',
  'AUTO_POLICY_NOT_REVERSIBLE',
  'AUTO_POLICY_HIGH_RISK',
  'listAiEvaluationResults',
  'aiEvaluationResults',
  'aiEvaluationPasses',
  'aiEvaluationFailures',
  'aiEvaluationUnresolved',
  'listRoutingPolicies',
  'routingPolicies',
  'routingPolicyVersions',
  'enabledRoutingPolicyVersions',
  'autonomyExpansionAllowed: false',
  'directMutationEnabled: false',
  'emergencyKillMutationEnabled: false',
  'policyMutationEnabled: false',
])
requireText('lib/ai/governance-command-center-state.ts', [
  "from('ai_systems')",
  "from('ai_system_versions')",
  "from('ai_system_decisions')",
  "from('ai_system_assessments')",
  "from('ai_evaluation_results')",
  "from('ai_telemetry_events')",
  "from('ai_routing_policy_versions')",
  "from('autonomy_policies')",
  "from('autonomy_actions')",
  'allowed_ai_system_ids',
  'min_evaluation_score',
  'min_scored_count',
  'allow_environment_fallback',
  'reviewer_capability',
  'project_id',
  "order('observed_at', { ascending: false }).limit(100)",
])
requireText('app/admin/ai-command-center/page.tsx', [
  'DataNexus AI Command Center',
  'authorizeProject',
  "'admin.manage'",
  'createGovernanceCommandCenterState',
  'createGovernanceLearningEngine',
  'Mutation controls remain closed',
  'form method="get"',
  'AI governance evidence',
  'Human decisions',
  'Assessments',
  'Automated evaluation evidence',
  'PASS or a high score does not approve an AI system, activate a version, or grant deployment authority.',
  'Absence means evaluation evidence has not been recorded, not that the governed AI systems passed evaluation.',
  'Governed learning candidates',
  'Verified outcomes and semantic memories are candidate learning only.',
  'Semantic promotion:',
  'Procedural promotion:',
  'Offline adaptation:',
  'Authoritative: no',
  'this Command Center provides no promotion action.',
  'Governed routing policy versions',
  'Routing policy versions are human-reviewed constraints consumed by the Intelligent Router.',
  'Policy mutation remains disabled here',
  'No governed AI routing policy versions are recorded for this project.',
  'unrestricted routing has governance approval',
  'AI telemetry',
  'Autonomy policies',
  'Recent autonomy actions',
])
requireText('lib/ai/learning-engine.ts', [
  'VERIFIED_OUTCOME_CANDIDATE',
  'DURABLE_UNVALIDATED_SEMANTIC',
  'AUTHORITY_PROOF_NOT_RECORDED',
  'authoritativeSemanticCount: 0',
  'semanticPromotionEnabled: false',
  'proceduralPromotionEnabled: false',
  'offlineAdaptationEnabled: false',
])
requireText('lib/ai/routing-policy.ts', [
  'NO_ACTIVE_POLICY',
  'POLICY_DISABLED',
  'AI_SYSTEM_NOT_ALLOWED',
  'INSUFFICIENT_EVALUATION_SCORE',
  'INSUFFICIENT_EVALUATION_EVIDENCE',
  'POLICY_ALLOWED',
])
requireText('app/admin/page.tsx', ["href=\"/admin/ai-command-center\""])

const adapter = read('lib/ai/governance-command-center-state.ts')
for (const forbidden of ['.insert(', '.update(', '.delete(', '.upsert(', '.rpc(']) {
  if (adapter.includes(forbidden)) throw new Error(`Command Center projection must remain read-only: found ${forbidden}`)
}

const page = read('app/admin/ai-command-center/page.tsx')
for (const forbidden of ['method="post"', "'use server'", '.insert(', '.update(', '.delete(', '.upsert(', '.rpc(', '.promote(']) {
  if (page.includes(forbidden)) throw new Error(`Command Center page must remain read-only: found ${forbidden}`)
}

console.log('ADR-006 Command Center read-only control-state, governance evidence, automated evaluation evidence, governed learning candidates, governed routing policy visibility, and UI boundary verified.')