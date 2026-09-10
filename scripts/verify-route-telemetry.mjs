import fs from 'node:fs'

const observable = fs.readFileSync('lib/ai/observable-intelligent-router.ts', 'utf8')
const provider = fs.readFileSync('lib/ai/reasoning-provider.ts', 'utf8')
const composition = fs.readFileSync('lib/ai/governance-intelligent-router.ts', 'utf8')
const budgetPolicy = fs.readFileSync('lib/ai/governance-reasoning-budget-policy.ts', 'utf8')
const budgetContract = fs.readFileSync('lib/ai/reasoning-budget-policy.ts', 'utf8')
const admissionContract = fs.readFileSync('lib/ai/resource-budget-admission.ts', 'utf8')
const admissionAdapter = fs.readFileSync('lib/ai/governance-resource-budget-admission.ts', 'utf8')
const admissionMigration = fs.readFileSync('supabase/migrations/20260909112000_adr006_atomic_project_budget_admission.sql', 'utf8')
const scopeMigration = fs.readFileSync('supabase/migrations/20260910185600_generalize_ai_budget_admission_scope.sql', 'utf8')
const intelligentRouter = fs.readFileSync('lib/ai/intelligent-router.ts', 'utf8')
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
  'configuredAdmissionPolicies',
  'Math.min(callerRequestedMaxOutputTokens, governanceMaxOutputTokens)',
  'this.budgetPolicy.resolveBudget',
  'aiSystemId: this.context.aiSystemId ?? null',
  'agentDefinitionId: this.context.agentDefinitionId ?? null',
  'await this.budgetAdmission.acquire({',
  'policyVersionId: policy.policyId',
  'correlationId: admissionCorrelationId',
  'await releaseAdmissionLeases()',
  'throw admissionDeniedError(`${policy.scopeType}/${policy.scopeKey}:${admission.reason}`)',
  'this.provider.generateJson(budgetEvidence.request)',
  'correlationId: this.context.executionCorrelationId ?? null',
  'requested_max_output_tokens: budgetEvidence.callerRequestedMaxOutputTokens',
  'governance_max_output_tokens: budgetEvidence.governanceMaxOutputTokens',
  'effective_max_output_tokens: budgetEvidence.effectiveMaxOutputTokens',
  'resource_budget_policy_ids: budgetPolicyIds',
  'resource_budget_admissions: admissions.map',
  'policy_version_id: entry.policyVersionId',
  'scope_type: entry.scopeType',
  'scope_key: entry.scopeKey',
  "error_name: error instanceof Error ? error.name : 'UnknownError'",
  'provider_http_status: providerHttpError?.status ?? null',
]) if (!observable.includes(token)) failures.push(`missing governed invocation/admission token: ${token}`)

for (const token of [
  'export interface ReasoningBudgetPolicyProvider',
  'resolveProjectBudget(projectId: string)',
  'resolveBudget?',
  'ReasoningBudgetContext',
  'ReasoningAdmissionPolicy',
  'maxOutputTokens: number | null',
  'maxRequestsPerMinute: number | null',
  'maxConcurrentExecutions: number | null',
]) if (!budgetContract.includes(token)) failures.push(`missing reasoning budget contract token: ${token}`)

for (const token of [
  "from('ai_resource_budget_policy_effective')",
  'scope_type',
  'scope_key',
  "row.scope_type === 'PROJECT'",
  "row.scope_type === 'AI_SYSTEM'",
  "row.scope_type === 'AGENT'",
  'Math.min(...concrete)',
  'admissionPolicies',
]) if (!budgetPolicy.includes(token)) failures.push(`missing canonical composed budget adapter token: ${token}`)

for (const token of [
  'export interface ProjectBudgetAdmissionProvider',
  'acquire(input: AcquireProjectBudgetAdmissionInput)',
  'release(input: ReleaseProjectBudgetLeaseInput)',
  "'RATE_LIMIT'",
  "'CONCURRENCY_LIMIT'",
]) if (!admissionContract.includes(token)) failures.push(`missing admission contract token: ${token}`)

for (const token of [
  "rpc('acquire_ai_project_resource_budget_admission'",
  "rpc('release_ai_project_resource_budget_lease'",
  'p_policy_version_id: policyVersionId',
  'p_correlation_id: correlationId',
]) if (!admissionAdapter.includes(token)) failures.push(`missing governance admission adapter token: ${token}`)

for (const token of [
  'governance.acquire_ai_project_resource_budget_admission',
  'governance.release_ai_project_resource_budget_lease',
  'pg_advisory_xact_lock',
  "grant execute on function governance.acquire_ai_project_resource_budget_admission",
]) if (!admissionMigration.includes(token) && !scopeMigration.includes(token)) failures.push(`missing atomic admission migration token: ${token}`)

if (!scopeMigration.includes('effective.id = p_policy_version_id') || scopeMigration.includes("effective.scope_type = 'PROJECT'") || scopeMigration.includes("effective.scope_key = 'PROJECT'")) {
  failures.push('scope admission migration must admit exact current policy versions without a PROJECT-only restriction')
}
if (!composition.includes('createGovernanceReasoningBudgetPolicyProvider()')) failures.push('governed Intelligent Router must compose canonical reasoning budget policy provider')
if (!composition.includes('createGovernanceProjectBudgetAdmissionProvider()')) failures.push('governed Intelligent Router must compose atomic budget admission provider')
if (!composition.includes('new ObservableIntelligentRouter')) failures.push('governed router must remain observability-decorated')
if (!/import type \{[\s\S]*ReasoningBudgetPolicyProvider[\s\S]*\} from '\.\/reasoning-budget-policy'/.test(observable)) failures.push('budget policy dependency must remain type-only in observable wrapper')
if (!observable.includes("import type { ProjectBudgetAdmission, ProjectBudgetAdmissionProvider }")) failures.push('admission dependency must remain type-only in observable wrapper')
if (observable.includes("from './reasoning-budget-policy.ts'")) failures.push('observable wrapper must not introduce .ts runtime budget import coupling')
if (observable.includes("from './resource-budget-admission.ts'")) failures.push('observable wrapper must not introduce .ts runtime admission import coupling')

for (const token of ['maxOutputTokens?: number', 'new ReasoningProviderHttpError(response.status, observedRequestId(response))']) {
  if (!provider.includes(token)) failures.push(`missing provider output/error contract token: ${token}`)
}
if (provider.includes('response.text()')) failures.push('provider HTTP failure path must not read raw upstream response bodies')

for (const forbidden of [/prompt\s*:/i, /completion\s*:/i, /hidden[_\s-]*reason/i, /chain[_\s-]*of[_\s-]*thought/i, /error_message\s*:/i]) {
  if (forbidden.test(observable)) failures.push(`forbidden telemetry payload pattern: ${forbidden}`)
}

if (!intelligentRouter.includes('executionCorrelationId?: string | null')) failures.push('IntelligentRouteContext must carry a distinct execution correlation key')
if (!intelligentRouter.includes('agentDefinitionId?: string | null')) failures.push('IntelligentRouteContext must carry explicit agent identity for AGENT budget matching')
if (/correlationId:\s*(context\.)?traceContext/.test(observable)) failures.push('W3C trace context must not be repurposed as budget admission business identity')
if (!observable.includes('ProjectBudgetExecutionCorrelationError')) failures.push('configured admission limits must fail closed without canonical UUID execution correlation')
if (!observable.includes('Lease expiry is the bounded capacity backstop')) failures.push('lease release failure boundary must remain explicit')
if (!observable.includes('throw error')) failures.push('provider/budget failures must remain failures after telemetry recording')
if (!observable.includes('return result')) failures.push('successful model results must remain unchanged after telemetry recording')
if (!investigation.includes("import { randomUUID } from 'node:crypto'")) failures.push('profiling investigation must create a UUID execution identity when none is supplied')
if (!investigation.includes('executionCorrelationId = text(context.executionCorrelationId) || randomUUID()')) failures.push('profiling investigation must bind one execution correlation per model execution')
if (!investigation.includes('executionCorrelationId,')) failures.push('profiling investigation must propagate execution correlation into IntelligentRouteContext')
if (!investigation.includes('createGovernanceIntelligentRouter().route({')) failures.push('profiling investigation does not use governed Intelligent Router')
if (!investigation.includes("task: 'profiling_investigation'")) failures.push('profiling investigation does not declare profiling_investigation task')
if (!investigation.includes("from('dataset_versions')") || !investigation.includes("from('datasets')")) failures.push('profiling investigation does not resolve persisted project identity')
if (investigation.includes('getModelGateway')) failures.push('profiling investigation still bypasses Intelligent Router via ModelGateway')
if (!investigationEngine.includes('enrichInvestigationWithModel({')) failures.push('profiling investigation engine is not wired to model enrichment boundary')
if (!profilingExecutor.includes("case 'investigate_profile':") || !profilingExecutor.includes('investigateProfilingRun(profilingRunId, datasetVersionId)')) failures.push('production profiling executor does not reach investigation engine')

if (failures.length) {
  console.error('ADR-006/ADR-008 route and budget admission telemetry contract failed:')
  failures.forEach((failure) => console.error(` - ${failure}`))
  process.exit(1)
}
console.log('ADR-006/ADR-008 composed output budget, multi-scope admission, and invocation telemetry contract passed.')
