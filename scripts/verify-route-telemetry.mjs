import fs from 'node:fs'

const observable = fs.readFileSync('lib/ai/observable-intelligent-router.ts', 'utf8')
const provider = fs.readFileSync('lib/ai/reasoning-provider.ts', 'utf8')
const composition = fs.readFileSync('lib/ai/governance-intelligent-router.ts', 'utf8')
const budgetPolicy = fs.readFileSync('lib/ai/governance-reasoning-budget-policy.ts', 'utf8')
const budgetContract = fs.readFileSync('lib/ai/reasoning-budget-policy.ts', 'utf8')
const investigation = fs.readFileSync('lib/ai/investigation-model.ts', 'utf8')
const investigationEngine = fs.readFileSync('lib/profiling/investigation-engine.ts', 'utf8')
const profilingExecutor = fs.readFileSync('lib/agents/executors/profiling-executor.ts', 'utf8')
const failures = []

for (const token of [
  'ObservableIntelligentRouter',
  'class ObservableReasoningProvider',
  "eventType: 'AI_ROUTE_DECISION'",
  "eventType: 'MODEL_INVOCATION'",
  'applyProjectOutputBudget',
  'Math.min(callerRequestedMaxOutputTokens, governanceMaxOutputTokens)',
  'await this.budgetPolicy.resolveProjectBudget(this.context.projectId)',
  'this.provider.generateJson(budgetEvidence.request)',
  'requested_max_output_tokens: budgetEvidence.callerRequestedMaxOutputTokens',
  'governance_max_output_tokens: budgetEvidence.governanceMaxOutputTokens',
  'effective_max_output_tokens: budgetEvidence.effectiveMaxOutputTokens',
  'resource_budget_policy_id: budgetEvidence.budgetPolicyId',
  "error_name: error instanceof Error ? error.name : 'UnknownError'",
  'provider_http_status: providerHttpError?.status ?? null',
]) if (!observable.includes(token)) failures.push(`missing governed invocation/budget token: ${token}`)

for (const token of [
  'export interface ReasoningBudgetPolicyProvider',
  'resolveProjectBudget(projectId: string)',
  'maxOutputTokens: number',
]) if (!budgetContract.includes(token)) failures.push(`missing reasoning budget contract token: ${token}`)

for (const token of [
  "from('ai_resource_budget_policy_effective')",
  ".eq('scope_type', 'PROJECT')",
  ".eq('scope_key', 'PROJECT')",
  '.select(\'id,enabled,max_output_tokens_per_request\')',
  'if (!data || !data.enabled || data.max_output_tokens_per_request == null) return null',
]) if (!budgetPolicy.includes(token)) failures.push(`missing canonical project budget adapter token: ${token}`)

if (budgetPolicy.includes("'AI_SYSTEM'")) failures.push('project output budget adapter must not invent AI_SYSTEM precedence')
if (budgetPolicy.includes("'AGENT'")) failures.push('project output budget adapter must not invent AGENT precedence')
if (!composition.includes('createGovernanceReasoningBudgetPolicyProvider()')) failures.push('governed Intelligent Router must compose canonical reasoning budget policy provider')
if (!composition.includes('new ObservableIntelligentRouter')) failures.push('governed router must remain observability-decorated')
if (!observable.includes("import type { ProjectReasoningBudget, ReasoningBudgetPolicyProvider }")) failures.push('budget policy dependency must remain type-only in observable wrapper')
if (observable.includes("from './reasoning-budget-policy.ts'")) failures.push('observable wrapper must not introduce .ts runtime import coupling')

for (const token of ['maxOutputTokens?: number', 'new ReasoningProviderHttpError(response.status, observedRequestId(response))']) {
  if (!provider.includes(token)) failures.push(`missing provider output/error contract token: ${token}`)
}
if (provider.includes('response.text()')) failures.push('provider HTTP failure path must not read raw upstream response bodies')

for (const forbidden of [/prompt\s*:/i, /completion\s*:/i, /hidden[_\s-]*reason/i, /chain[_\s-]*of[_\s-]*thought/i, /error_message\s*:/i]) {
  if (forbidden.test(observable)) failures.push(`forbidden telemetry payload pattern: ${forbidden}`)
}

if (!observable.includes('throw error')) failures.push('provider/budget failures must remain failures after telemetry recording')
if (!observable.includes('return result')) failures.push('successful model results must remain unchanged after telemetry recording')
if (!investigation.includes('createGovernanceIntelligentRouter().route({')) failures.push('profiling investigation does not use governed Intelligent Router')
if (!investigation.includes("task: 'profiling_investigation'")) failures.push('profiling investigation does not declare profiling_investigation task')
if (!investigation.includes("from('dataset_versions')") || !investigation.includes("from('datasets')")) failures.push('profiling investigation does not resolve persisted project identity')
if (investigation.includes('getModelGateway')) failures.push('profiling investigation still bypasses Intelligent Router via ModelGateway')
if (!investigationEngine.includes('enrichInvestigationWithModel({')) failures.push('profiling investigation engine is not wired to model enrichment boundary')
if (!profilingExecutor.includes("case 'investigate_profile':") || !profilingExecutor.includes('investigateProfilingRun(profilingRunId, datasetVersionId)')) failures.push('production profiling executor does not reach investigation engine')

if (failures.length) {
  console.error('ADR-006 route/budget telemetry contract failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}
console.log('ADR-006 project-scope output budget enforcement and invocation telemetry contract passed.')
