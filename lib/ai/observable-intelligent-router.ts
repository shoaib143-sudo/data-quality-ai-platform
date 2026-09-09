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
import type { ProjectReasoningBudget, ReasoningBudgetPolicyProvider } from './reasoning-budget-policy'
import type { ProjectBudgetAdmission, ProjectBudgetAdmissionProvider } from './resource-budget-admission'
import type { TelemetryProvider, TelemetryTraceContext } from './telemetry-provider'

type ObservableReasoningContext = {
  projectId: string
  executionCorrelationId?: string | null
  aiSystemId?: string | null
  aiSystemVersionId?: string | null
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

  constructor(
    provider: ReasoningProvider,
    telemetry: TelemetryProvider,
    context: ObservableReasoningContext,
    budgetPolicy?: ReasoningBudgetPolicyProvider,
    budgetAdmission?: ProjectBudgetAdmissionProvider,
  ) {
    this.provider = provider
    this.telemetry = telemetry
    this.context = context
    this.budgetPolicy = budgetPolicy
    this.budgetAdmission = budgetAdmission
    this.id = provider.id
  }

  async generateJson(request: ReasoningRequest): Promise<ReasoningResult> {
    const startedAt = Date.now()
    let budgetEvidence = applyProjectOutputBudget(request, null)
    let admission: ProjectBudgetAdmission | null = null
    let admissionCorrelationId: string | null = null
    try {
      let projectBudget: ProjectReasoningBudget | null = null
      if (this.budgetPolicy) {
        projectBudget = await this.budgetPolicy.resolveProjectBudget(this.context.projectId)
        budgetEvidence = applyProjectOutputBudget(request, projectBudget)
      }

      if (projectBudget && hasAdmissionLimits(projectBudget)) {
        if (!this.budgetAdmission) throw new Error('Project resource budget admission provider is required for configured rate or concurrency limits')
        admissionCorrelationId = requiredExecutionCorrelationId(this.context.executionCorrelationId)
        admission = await this.budgetAdmission.acquire({
          projectId: this.context.projectId,
          policyVersionId: projectBudget.policyId,
          correlationId: admissionCorrelationId,
        })
        if (!admission.admitted) throw admissionDeniedError(admission.reason)
      }

      let result: ReasoningResult
      try {
        result = await this.provider.generateJson(budgetEvidence.request)
      } finally {
        if (admission?.leaseId && admissionCorrelationId && this.budgetAdmission) {
          try {
            await this.budgetAdmission.release({
              projectId: this.context.projectId,
              leaseId: admission.leaseId,
              correlationId: admissionCorrelationId,
            })
          } catch {
            // Lease expiry is the bounded capacity backstop. Release failure is execution-accounting
            // evidence and must not rewrite a completed model result or mask the provider failure.
          }
        }
      }

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
            resource_budget_admission_reason: admission?.reason ?? null,
            resource_budget_admission_id: admission?.admissionId ?? null,
            resource_budget_lease_id: admission?.leaseId ?? null,
            resource_budget_request_count_last_minute: admission?.requestCountLastMinute ?? null,
            resource_budget_active_concurrency: admission?.activeConcurrency ?? null,
            provider_request_id: result.providerRequestId ?? null, total_tokens: result.usage?.totalTokens ?? null,
          },
        })
      } catch {
        // Telemetry is observability evidence only. A telemetry failure must not
        // change or invalidate a completed model result.
      }
      return result
    } catch (error) {
      const providerHttpError = sanitizedProviderHttpFailure(error)
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
            resource_budget_admission_reason: admission?.reason ?? null,
            resource_budget_admission_id: admission?.admissionId ?? null,
            resource_budget_lease_id: admission?.leaseId ?? null,
            resource_budget_request_count_last_minute: admission?.requestCountLastMinute ?? null,
            resource_budget_active_concurrency: admission?.activeConcurrency ?? null,
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

  constructor(
    router: IntelligentModelRouter,
    telemetry: TelemetryProvider,
    budgetPolicy?: ReasoningBudgetPolicyProvider,
    budgetAdmission?: ProjectBudgetAdmissionProvider,
  ) {
    this.router = router
    this.telemetry = telemetry
    this.budgetPolicy = budgetPolicy
    this.budgetAdmission = budgetAdmission
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
        aiSystemId: decision.evidence?.aiSystemId ?? null,
        aiSystemVersionId: decision.evidence?.aiSystemVersionId ?? null, modelName: decision.evidence?.modelName ?? null,
        routingPolicyId: decision.evidence?.routingPolicyId ?? null, routingPolicyReason: decision.evidence?.routingPolicyReason ?? null,
        traceContext: context.traceContext ?? null, routeSource: decision.source, routeReason: decision.reason,
      }, this.budgetPolicy, this.budgetAdmission),
    }
  }
}
