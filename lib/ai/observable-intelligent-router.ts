import { randomUUID } from 'node:crypto'
import type {
  IntelligentModelRouter,
  IntelligentRouteContext,
  IntelligentRouteDecision,
} from './intelligent-router'
import type {
  ReasoningProvider,
  ReasoningRequest,
  ReasoningResult,
} from './reasoning-provider'
import type { ModelCostAccountingProvider, ModelCostAccountingRecord } from './cost-accounting'
import type {
  ProjectReasoningBudget,
  ReasoningAdmissionPolicy,
  ReasoningBudgetPolicyProvider,
} from './reasoning-budget-policy'
import type { ProjectBudgetAdmission, ProjectBudgetAdmissionProvider } from './resource-budget-admission'
import type { TelemetryProvider, TelemetryTraceContext } from './telemetry-provider'
import type { LearningEvaluationRuntimeBudgetProvider, LearningEvaluationRuntimeReservation } from './learning-evaluation-runtime-budget'

type ObservableReasoningContext = {
  projectId: string
  signal?: AbortSignal
  executionCorrelationId?: string | null
  aiSystemId?: string | null
  aiSystemVersionId?: string | null
  agentDefinitionId?: string | null
  learningEvaluationRuntime?: IntelligentRouteContext['learningEvaluationRuntime']
  modelName?: string | null
  routingPolicyId?: string | null
  routingPolicyReason?: string | null
  traceContext?: TelemetryTraceContext | null
  routeSource: string
  routeReason: string
}

type SanitizedProviderHttpFailure = {
  status: number
  providerRequestId?: string
}

type AdmissionEvidence = ProjectBudgetAdmission & {
  policyVersionId: string
  scopeType: string
  scopeKey: string
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function positiveInteger(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
  return value
}

function requiredExecutionCorrelationId(value: string | null | undefined) {
  const normalized = value?.trim() ?? ''
  if (!UUID_PATTERN.test(normalized)) {
    const error = new Error('A canonical UUID executionCorrelationId is required for project resource budget admission')
    error.name = 'ProjectBudgetExecutionCorrelationError'
    throw error
  }
  return normalized
}

function admissionDeniedError(reason: string) {
  const error = new Error(`Project resource budget admission denied: ${reason}`)
  error.name = 'ProjectBudgetAdmissionDeniedError'
  return error
}

function hasAdmissionLimits(budget: ProjectReasoningBudget) {
  return budget.maxRequestsPerMinute !== null || budget.maxConcurrentExecutions !== null
}

function configuredAdmissionPolicies(budget: ProjectReasoningBudget): ReasoningAdmissionPolicy[] {
  if (budget.admissionPolicies) return budget.admissionPolicies
  if (!hasAdmissionLimits(budget)) return []
  return [{
    policyId: budget.policyId,
    scopeType: 'PROJECT',
    scopeKey: 'PROJECT',
    maxRequestsPerMinute: budget.maxRequestsPerMinute,
    maxConcurrentExecutions: budget.maxConcurrentExecutions,
  }]
}

function applyProjectOutputBudget(request: ReasoningRequest, budget: ProjectReasoningBudget | null) {
  if (!budget) return {
    request,
    callerRequestedMaxOutputTokens: request.maxOutputTokens ?? null,
    governanceMaxOutputTokens: null,
    effectiveMaxOutputTokens: request.maxOutputTokens ?? null,
    budgetPolicyId: null,
  }
  const callerRequestedMaxOutputTokens = request.maxOutputTokens == null ? null : positiveInteger(request.maxOutputTokens, 'request.maxOutputTokens')
  if (budget.maxOutputTokens == null) return {
    request,
    callerRequestedMaxOutputTokens,
    governanceMaxOutputTokens: null,
    effectiveMaxOutputTokens: callerRequestedMaxOutputTokens,
    budgetPolicyId: budget.policyId,
  }
  const governanceMaxOutputTokens = positiveInteger(budget.maxOutputTokens, 'budget.maxOutputTokens')
  const effectiveMaxOutputTokens = callerRequestedMaxOutputTokens == null
    ? governanceMaxOutputTokens
    : Math.min(callerRequestedMaxOutputTokens, governanceMaxOutputTokens)
  return {
    request: { ...request, maxOutputTokens: effectiveMaxOutputTokens },
    callerRequestedMaxOutputTokens,
    governanceMaxOutputTokens,
    effectiveMaxOutputTokens,
    budgetPolicyId: budget.policyId,
  }
}

function sanitizedProviderHttpFailure(error: unknown): SanitizedProviderHttpFailure | null {
  if (!(error instanceof Error) || error.name !== 'ReasoningProviderHttpError') return null
  const candidate = error as Error & { status?: unknown; providerRequestId?: unknown }
  if (typeof candidate.status !== 'number' || !Number.isInteger(candidate.status)) return null
  const providerRequestId = typeof candidate.providerRequestId === 'string'
    ? candidate.providerRequestId.trim().slice(0, 256)
    : undefined
  return { status: candidate.status, ...(providerRequestId ? { providerRequestId } : {}) }
}

class ObservableReasoningProvider implements ReasoningProvider {
  readonly id: string
  private readonly provider: ReasoningProvider
  private readonly telemetry: TelemetryProvider
  private readonly context: ObservableReasoningContext
  private readonly budgetPolicy?: ReasoningBudgetPolicyProvider
  private readonly budgetAdmission?: ProjectBudgetAdmissionProvider
  private readonly costAccounting?: ModelCostAccountingProvider
  private readonly learningRuntimeBudget?: LearningEvaluationRuntimeBudgetProvider

  constructor(
    provider: ReasoningProvider,
    telemetry: TelemetryProvider,
    context: ObservableReasoningContext,
    budgetPolicy?: ReasoningBudgetPolicyProvider,
    budgetAdmission?: ProjectBudgetAdmissionProvider,
    costAccounting?: ModelCostAccountingProvider,
    learningRuntimeBudget?: LearningEvaluationRuntimeBudgetProvider,
  ) {
    this.provider = provider
    this.telemetry = telemetry
    this.context = context
    this.budgetPolicy = budgetPolicy
    this.budgetAdmission = budgetAdmission
    this.costAccounting = costAccounting
    this.learningRuntimeBudget = learningRuntimeBudget
    this.id = provider.id
  }

  async generateJson(request: ReasoningRequest): Promise<ReasoningResult> {
    // A caller may add cancellation but cannot replace the execution deadline.
    const signals = [this.context.signal, request.signal].filter((signal): signal is AbortSignal => signal != null)
    let signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0]
    if (signal) request = { ...request, signal }
    const startedAt = Date.now()
    let budgetEvidence = applyProjectOutputBudget(request, null)
    let admissions: AdmissionEvidence[] = []
    let budgetPolicyIds: string[] = []
    let admissionCorrelationId: string | null = null
    let invocationId: string | null = null
    let costEvidence: ModelCostAccountingRecord | null = null
    let learningReservation: LearningEvaluationRuntimeReservation | null = null
    let learningEventRecorded = false
    let providerStarted = false
    let providerResult: ReasoningResult | null = null

    const releaseAdmissionLeases = async () => {
      if (!admissionCorrelationId || !this.budgetAdmission) return
      for (const admission of admissions) {
        if (!admission.leaseId) continue
        try {
          await this.budgetAdmission.release({
            projectId: this.context.projectId,
            leaseId: admission.leaseId,
            correlationId: admissionCorrelationId,
          })
        } catch {
          // Lease expiry is the bounded capacity backstop. A release failure is evidence,
          // not authority to rewrite the provider result or bypass another scope.
        }
      }
    }

    try {
      signal?.throwIfAborted()
      let projectBudget: ProjectReasoningBudget | null = null
      if (this.budgetPolicy) {
        projectBudget = this.budgetPolicy.resolveBudget
          ? await this.budgetPolicy.resolveBudget({
              projectId: this.context.projectId,
              aiSystemId: this.context.aiSystemId ?? null,
              agentDefinitionId: this.context.agentDefinitionId ?? null,
            })
          : await this.budgetPolicy.resolveProjectBudget(this.context.projectId)
        budgetEvidence = applyProjectOutputBudget(request, projectBudget)
        budgetPolicyIds = projectBudget?.policyIds ?? (projectBudget ? [projectBudget.policyId] : [])
      }

      const admissionPolicies = projectBudget ? configuredAdmissionPolicies(projectBudget) : []
      if (admissionPolicies.length) {
        if (!this.budgetAdmission) throw new Error('Project resource budget admission provider is required for configured rate or concurrency limits')
        admissionCorrelationId = requiredExecutionCorrelationId(this.context.executionCorrelationId)
        for (const policy of admissionPolicies) {
          const admission = await this.budgetAdmission.acquire({
            projectId: this.context.projectId,
            policyVersionId: policy.policyId,
            correlationId: admissionCorrelationId,
          })
          const evidence: AdmissionEvidence = {
            ...admission,
            policyVersionId: policy.policyId,
            scopeType: policy.scopeType,
            scopeKey: policy.scopeKey,
          }
          admissions.push(evidence)
          if (!admission.admitted) {
            await releaseAdmissionLeases()
            throw admissionDeniedError(`${policy.scopeType}/${policy.scopeKey}:${admission.reason}`)
          }
        }
      }

      invocationId = randomUUID()

      if (this.context.learningEvaluationRuntime) {
        if (!this.learningRuntimeBudget) {
          throw new Error('Learning evaluation runtime budget provider is required for controlled evaluation execution')
        }
        const modelName = this.context.modelName?.trim()
        if (!modelName) throw new Error('Controlled learning evaluation requires an exact governed model identity')
        const executionCorrelationId = requiredExecutionCorrelationId(this.context.executionCorrelationId)
        learningReservation = await this.learningRuntimeBudget.reserve({
          projectId: this.context.projectId,
          policyId: this.context.learningEvaluationRuntime.policyId,
          candidateId: this.context.learningEvaluationRuntime.candidateId,
          variant: this.context.learningEvaluationRuntime.variant,
          invocationId,
          executionCorrelationId,
          providerId: this.provider.id,
          modelName,
        })
        const deadlineSignal = AbortSignal.timeout(learningReservation.latencyMsBudget)
        signal = signal ? AbortSignal.any([signal, deadlineSignal]) : deadlineSignal
        const requestedMax = budgetEvidence.request.maxOutputTokens
        const learningMax = learningReservation.reservedTokens
        budgetEvidence = {
          ...budgetEvidence,
          request: {
            ...budgetEvidence.request,
            maxOutputTokens: requestedMax == null ? learningMax : Math.min(requestedMax, learningMax),
            signal,
          },
          effectiveMaxOutputTokens: requestedMax == null
            ? learningMax
            : Math.min(requestedMax, learningMax),
        }
      }

      try {
        signal?.throwIfAborted()
        providerStarted = true
        providerResult = await this.provider.generateJson(budgetEvidence.request)
      } finally {
        await releaseAdmissionLeases()
      }
      const result = providerResult

      if (this.costAccounting) {
        costEvidence = await this.costAccounting.recordInvocation({
          invocationId,
          projectId: this.context.projectId,
          executionCorrelationId: this.context.executionCorrelationId ?? null,
          providerRequestId: result.providerRequestId ?? null,
          providerId: result.provider,
          modelName: result.model,
          usage: result.usage,
          observedAt: new Date().toISOString(),
        })
      }

      if (learningReservation && this.context.learningEvaluationRuntime && this.learningRuntimeBudget) {
        const canonicalCost = costEvidence?.accountingStatus === 'PRICED'
          && costEvidence.currency === 'USD'
          && costEvidence.pricingVersionId === learningReservation.pricingVersionId
          && costEvidence.totalCost != null
          ? Number(costEvidence.totalCost)
          : null
        const canonicalTokens = costEvidence?.totalTokens ?? result.usage?.totalTokens ?? null
        const accountingComplete = canonicalCost != null
          && Number.isFinite(canonicalCost)
          && canonicalTokens != null
          && Number.isSafeInteger(canonicalTokens)
          && canonicalTokens >= 0
        const settlement = await this.learningRuntimeBudget.recordEvent({
          projectId: this.context.projectId,
          policyId: this.context.learningEvaluationRuntime.policyId,
          reservationId: learningReservation.reservationId,
          releaseWithoutProviderCall: false,
          accountingComplete,
          actualCostUsd: accountingComplete ? canonicalCost : null,
          actualTokens: accountingComplete ? canonicalTokens : null,
          actualLatencyMs: accountingComplete ? result.latencyMs : null,
          reason: accountingComplete
            ? 'CANONICAL_USAGE_AND_PRICING_RECONCILED'
            : 'CANONICAL_ACCOUNTING_INCOMPLETE_OR_PRICING_MISMATCH',
        })
        learningEventRecorded = true
        if (settlement.status === 'EXCEEDED') {
          const budgetError = new Error('Learning evaluation runtime exceeded a locked per-run budget')
          budgetError.name = 'LearningEvaluationRuntimeBudgetExceededError'
          throw budgetError
        }
        if (settlement.status !== 'RECONCILED') {
          const accountingError = new Error('Learning evaluation runtime accounting is incomplete; result consumption is blocked')
          accountingError.name = 'LearningEvaluationAccountingIncompleteError'
          throw accountingError
        }
      }

      // Account for a completed call even when cancellation races its response.
      signal?.throwIfAborted()

      const primaryAdmission = admissions[0] ?? null
      try {
        await this.telemetry.record({
          projectId: this.context.projectId,
          eventType: 'MODEL_INVOCATION', operation: request.task, status: 'SUCCESS',
          providerId: result.provider, modelName: result.model,
          aiSystemId: this.context.aiSystemId ?? null, aiSystemVersionId: this.context.aiSystemVersionId ?? null,
          correlationId: this.context.executionCorrelationId ?? null,
          traceContext: this.context.traceContext ?? null, latencyMs: result.latencyMs,
          inputTokens: result.usage?.inputTokens ?? null, outputTokens: result.usage?.outputTokens ?? null,
          attributes: {
            task: request.task, route_source: this.context.routeSource, route_reason: this.context.routeReason,
            routing_policy_id: this.context.routingPolicyId ?? null, routing_policy_reason: this.context.routingPolicyReason ?? null,
            requested_max_output_tokens: budgetEvidence.callerRequestedMaxOutputTokens,
            governance_max_output_tokens: budgetEvidence.governanceMaxOutputTokens,
            effective_max_output_tokens: budgetEvidence.effectiveMaxOutputTokens,
            resource_budget_policy_id: budgetEvidence.budgetPolicyId,
            resource_budget_policy_ids: budgetPolicyIds,
            resource_budget_admission_reason: primaryAdmission?.reason ?? null,
            resource_budget_admission_id: primaryAdmission?.admissionId ?? null,
            resource_budget_lease_id: primaryAdmission?.leaseId ?? null,
            resource_budget_request_count_last_minute: primaryAdmission?.requestCountLastMinute ?? null,
            resource_budget_active_concurrency: primaryAdmission?.activeConcurrency ?? null,
            resource_budget_admissions: admissions.map((entry) => ({
              policy_version_id: entry.policyVersionId,
              scope_type: entry.scopeType,
              scope_key: entry.scopeKey,
              reason: entry.reason,
              admission_id: entry.admissionId,
              lease_id: entry.leaseId,
            })),
            invocation_id: invocationId,
            cost_accounting_status: costEvidence?.accountingStatus ?? null,
            cost_pricing_version_id: costEvidence?.pricingVersionId ?? null,
            cost_currency: costEvidence?.currency ?? null,
            canonical_input_cost: costEvidence?.inputCost ?? null,
            canonical_output_cost: costEvidence?.outputCost ?? null,
            canonical_total_cost: costEvidence?.totalCost ?? null,
            provider_request_id: result.providerRequestId ?? null, total_tokens: result.usage?.totalTokens ?? null,
            resilience_requested_provider: result.resilience?.requestedProvider ?? null,
            resilience_requested_model: result.resilience?.requestedModel ?? null,
            resilience_actual_provider: result.resilience?.actualProvider ?? result.provider,
            resilience_actual_model: result.resilience?.actualModel ?? result.model,
            resilience_fallback_applied: result.resilience?.fallbackApplied ?? false,
            resilience_fallback_reason: result.resilience?.fallbackReason ?? null,
            resilience_attempts: result.resilience?.attempts ?? 1,
          },
        })
      } catch {
        // Telemetry is observability evidence only. A telemetry failure must not
        // change or invalidate a completed model result.
      }
      return result
    } catch (error) {
      if (learningReservation && this.context.learningEvaluationRuntime && this.learningRuntimeBudget && !learningEventRecorded) {
        try {
          const releaseWithoutProviderCall = !providerStarted
          await this.learningRuntimeBudget.recordEvent({
            projectId: this.context.projectId,
            policyId: this.context.learningEvaluationRuntime.policyId,
            reservationId: learningReservation.reservationId,
            releaseWithoutProviderCall,
            accountingComplete: releaseWithoutProviderCall,
            actualCostUsd: releaseWithoutProviderCall ? 0 : null,
            actualTokens: releaseWithoutProviderCall ? 0 : providerResult?.usage?.totalTokens ?? null,
            actualLatencyMs: releaseWithoutProviderCall ? 0 : providerResult?.latencyMs ?? null,
            reason: releaseWithoutProviderCall
              ? 'PROVIDER_TRANSPORT_NOT_STARTED'
              : 'PROVIDER_OR_ACCOUNTING_RESULT_UNRESOLVED',
          })
          learningEventRecorded = true
        } catch {
          // The durable reservation remains budget-consuming. A settlement outage
          // must never turn unknown provider spend into reusable experiment budget.
        }
      }
      const providerHttpError = sanitizedProviderHttpFailure(error)
      const primaryAdmission = admissions[0] ?? null
      try {
        await this.telemetry.record({
          projectId: this.context.projectId, eventType: 'MODEL_INVOCATION', operation: request.task, status: 'ERROR',
          providerId: this.provider.id, modelName: this.context.modelName ?? null,
          aiSystemId: this.context.aiSystemId ?? null, aiSystemVersionId: this.context.aiSystemVersionId ?? null,
          correlationId: this.context.executionCorrelationId ?? null,
          traceContext: this.context.traceContext ?? null, latencyMs: Math.max(0, Date.now() - startedAt),
          attributes: {
            task: request.task, route_source: this.context.routeSource, route_reason: this.context.routeReason,
            routing_policy_id: this.context.routingPolicyId ?? null, routing_policy_reason: this.context.routingPolicyReason ?? null,
            requested_max_output_tokens: budgetEvidence.callerRequestedMaxOutputTokens,
            governance_max_output_tokens: budgetEvidence.governanceMaxOutputTokens,
            effective_max_output_tokens: budgetEvidence.effectiveMaxOutputTokens,
            resource_budget_policy_id: budgetEvidence.budgetPolicyId,
            resource_budget_policy_ids: budgetPolicyIds,
            resource_budget_admission_reason: primaryAdmission?.reason ?? null,
            resource_budget_admission_id: primaryAdmission?.admissionId ?? null,
            resource_budget_lease_id: primaryAdmission?.leaseId ?? null,
            resource_budget_request_count_last_minute: primaryAdmission?.requestCountLastMinute ?? null,
            resource_budget_active_concurrency: primaryAdmission?.activeConcurrency ?? null,
            resource_budget_admissions: admissions.map((entry) => ({
              policy_version_id: entry.policyVersionId,
              scope_type: entry.scopeType,
              scope_key: entry.scopeKey,
              reason: entry.reason,
              admission_id: entry.admissionId,
              lease_id: entry.leaseId,
            })),
            invocation_id: invocationId,
            cost_accounting_status: costEvidence?.accountingStatus ?? null,
            error_name: error instanceof Error ? error.name : 'UnknownError',
            provider_http_status: providerHttpError?.status ?? null,
            provider_request_id: providerHttpError?.providerRequestId ?? null,
          },
        })
      } catch {
        // Telemetry outages never convert or suppress provider or governance-budget failures.
      }
      throw error
    }
  }
}

export class ObservableIntelligentRouter implements IntelligentModelRouter {
  private readonly router: IntelligentModelRouter
  private readonly telemetry: TelemetryProvider
  private readonly budgetPolicy?: ReasoningBudgetPolicyProvider
  private readonly budgetAdmission?: ProjectBudgetAdmissionProvider
  private readonly costAccounting?: ModelCostAccountingProvider
  private readonly learningRuntimeBudget?: LearningEvaluationRuntimeBudgetProvider

  constructor(
    router: IntelligentModelRouter,
    telemetry: TelemetryProvider,
    budgetPolicy?: ReasoningBudgetPolicyProvider,
    budgetAdmission?: ProjectBudgetAdmissionProvider,
    costAccounting?: ModelCostAccountingProvider,
    learningRuntimeBudget?: LearningEvaluationRuntimeBudgetProvider,
  ) {
    this.router = router
    this.telemetry = telemetry
    this.budgetPolicy = budgetPolicy
    this.budgetAdmission = budgetAdmission
    this.costAccounting = costAccounting
    this.learningRuntimeBudget = learningRuntimeBudget
  }

  async route(context: IntelligentRouteContext): Promise<IntelligentRouteDecision> {
    const startedAt = Date.now()
    const decision = await this.router.route(context)
    try {
      await this.telemetry.record({
        projectId: context.projectId, eventType: 'AI_ROUTE_DECISION', operation: 'model_route',
        status: decision.source === 'UNAVAILABLE' ? 'ERROR' : 'SUCCESS', providerId: decision.provider?.id ?? null,
        modelName: decision.evidence?.modelName ?? null, aiSystemId: decision.evidence?.aiSystemId ?? null,
        aiSystemVersionId: decision.evidence?.aiSystemVersionId ?? null,
        correlationId: context.executionCorrelationId ?? null,
        traceContext: context.traceContext ?? null,
        latencyMs: Math.max(0, Date.now() - startedAt),
        attributes: {
          task: context.task, sensitivity: context.sensitivity ?? null, risk: context.risk ?? null,
          route_source: decision.source, route_reason: decision.reason,
          routing_policy_id: decision.evidence?.routingPolicyId ?? null,
          routing_policy_reason: decision.evidence?.routingPolicyReason ?? null,
          evaluation_average_score: decision.evidence?.evaluationAverageScore ?? null,
          evaluation_scored_count: decision.evidence?.evaluationScoredCount ?? null,
          evaluation_pass_rate: decision.evidence?.evaluationPassRate ?? null,
        },
      })
    } catch {
      // Telemetry is observability evidence, not routing authority. A telemetry outage
      // must not change an already-resolved route decision or bypass a fail-closed outcome.
    }
    if (!decision.provider) return decision
    return {
      ...decision,
      provider: new ObservableReasoningProvider(decision.provider, this.telemetry, {
        projectId: context.projectId, executionCorrelationId: context.executionCorrelationId ?? null,
        signal: context.signal,
        aiSystemId: decision.evidence?.aiSystemId ?? null,
        aiSystemVersionId: decision.evidence?.aiSystemVersionId ?? null,
        agentDefinitionId: context.agentDefinitionId ?? null,
        learningEvaluationRuntime: context.learningEvaluationRuntime ?? null,
        modelName: decision.evidence?.modelName ?? null,
        routingPolicyId: decision.evidence?.routingPolicyId ?? null, routingPolicyReason: decision.evidence?.routingPolicyReason ?? null,
        traceContext: context.traceContext ?? null, routeSource: decision.source, routeReason: decision.reason,
      }, this.budgetPolicy, this.budgetAdmission, this.costAccounting, this.learningRuntimeBudget),
    }
  }
}
