import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260912183000_profile_readiness_ai_remediation_tool.sql', 'utf8')
const mergedAdmissionMigration = fs.readFileSync('supabase/migrations/20260912174600_project_profile_readiness_admission_gate.sql', 'utf8')
const mainAdmissionMigration = `-- Defense-in-depth admission gate for profiling runs.\n-- The readiness verifier remains read-only. This trigger prevents a profile run\n-- from being created for a dataset version whose deterministic readiness state\n-- is BLOCKED or NOT_ASSESSED.`
const executor = fs.readFileSync('lib/agents/executors/profiling-executor.ts', 'utf8')
const route = fs.readFileSync('app/api/profiling/readiness/remediate/route.ts', 'utf8')
const model = fs.readFileSync('lib/ai/profile-readiness-remediation-model.ts', 'utf8')
const agent = fs.readFileSync('lib/profiling/readiness-remediation-agent.ts', 'utf8')
const policy = fs.readFileSync('lib/profiling/readiness-remediation-policy.ts', 'utf8')
const repair = fs.readFileSync('lib/profiling/source-readiness-repair.ts', 'utf8')
const validationRoute = fs.readFileSync('app/api/datasets/source/validate/route.ts', 'utf8')
const ui = fs.readFileSync('app/datasets/dataset-actions.tsx', 'utf8')
const unit = fs.readFileSync('scripts/test-profile-readiness-remediation-policy.mjs', 'utf8')

const requiredMigration = [
  "'remediate_profile_readiness'",
  "'executor', 'profiling-executor'",
  "'operation', 'remediate_profile_readiness'",
  "'approval_required', false",
  "'readiness_authority_change', false",
  "'governance_authority_change', false",
  'PROFILE_READINESS_AI_REMEDIATION_TOOL_REGISTRATION_FAILED',
]
for (const marker of requiredMigration) if (!migration.includes(marker)) throw new Error(`AI remediation tool contract missing: ${marker}`)
if (!mergedAdmissionMigration.startsWith(mainAdmissionMigration)) throw new Error('Previously merged profile-run admission migration header changed unexpectedly')
if (mergedAdmissionMigration.includes("'remediate_profile_readiness'")) throw new Error('Already-merged admission migration must remain immutable; AI tool registration belongs in a forward migration')

for (const marker of [
  "case 'remediate_profile_readiness'",
  'executeProfileReadinessRemediation({ projectId, datasetVersionId, agentRunId })',
  'admitNativeToolInvocation({',
]) if (!executor.includes(marker)) throw new Error(`Profiling executor AI remediation integration missing: ${marker}`)

for (const marker of [
  "authorizeDatasetVersion(user.id, datasetVersionId, 'profiling.execute')",
  "agent_key', 'profiling_agent'",
  "step_name: 'remediate_profile_readiness'",
  "executeProfilingExecutor(\n      'remediate_profile_readiness'",
]) if (!route.includes(marker)) throw new Error(`AI remediation endpoint governance missing: ${marker}`)

for (const marker of [
  'createGovernanceIntelligentRouter()',
  "task: 'profiling_investigation'",
  "risk: 'LOW'",
  'allowed_actions',
  'Never invent evidence',
  'Never change credentials',
]) if (!model.includes(marker)) throw new Error(`AI remediation model governance missing: ${marker}`)
if (model.includes('getModelGateway(') || model.includes('getReasoningProvider(')) {
  throw new Error('AI remediation must use the governed intelligent router rather than a direct model provider')
}

for (const marker of [
  'evaluateProfileReadinessRemediationPolicy(before)',
  'allowedActions: policy.allowedActions',
  'if (!policy.canExecuteLowRiskRepair || !policy.sourceId)',
  'revalidateAndReconcileSourceForProfiling',
  'const after = await loadReadiness',
]) if (!agent.includes(marker)) throw new Error(`AI remediation execution fence missing: ${marker}`)

for (const marker of [
  "'SOURCE_NOT_OBSERVED_READY'",
  "'EXECUTION_SOURCE_NOT_BOUND'",
  'blockerCodes.every',
  '!approvalRequired',
  'allLowRisk',
  'allAddressableBySourceRevalidation',
]) if (!policy.includes(marker)) throw new Error(`AI remediation pure policy fence missing: ${marker}`)
if (policy.includes("'SOURCE_NOT_ACTIVE',") || policy.includes("'GOVERNED_SCOPE_NOT_READY',")) {
  throw new Error('Approval-gated lifecycle/scope blockers must not be in the automatic source-repair allowlist')
}

if (!validationRoute.includes('revalidateAndReconcileSourceForProfiling')) throw new Error('Manual source validation must reuse the same governed repair primitive')
if (!repair.includes('validateDataSourceForProfiling') || !repair.includes('discoverNativeHierarchy')) throw new Error('Governed repair primitive must reuse existing source validation paths')

for (const marker of [
  "fetch('/api/profiling/readiness/remediate'",
  'Ask AI to repair',
  "outcome.status === 'APPROVAL_REQUIRED'",
  'await refreshReadiness()',
]) if (!ui.includes(marker)) throw new Error(`Readiness UI AI option missing: ${marker}`)
if (ui.includes("fetch('/api/datasets/source/validate'")) throw new Error('Dataset readiness AI button must not bypass the governed AI remediation endpoint')

for (const marker of [
  'SOURCE_NOT_OBSERVED_READY: true, SOURCE_NOT_ACTIVE: true',
  'assert.equal(policy.approvalRequired, true)',
  'assert.equal(policy.canExecuteLowRiskRepair, false)',
  'DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE',
]) if (!unit.includes(marker)) throw new Error(`AI remediation negative unit coverage missing: ${marker}`)

console.log('Governed AI profile-readiness remediation contract verified, including forward-only migration history.')
