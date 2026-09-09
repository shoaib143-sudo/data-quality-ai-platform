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
import type { TelemetryProvider, TelemetryTraceContext } from './telemetry-provider'

type ObservableReasoningContext = {
  projectId: string
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

function positiveInteger(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) throw new Error(`${label} must be a positive integer`)
  return value
}

function applyProjectOutputBudget(request: ReasoningRequest, budget: ProjectReasoningBudget | null) {
  if (!budget) return {
    request,
    callerRequestedMaxOutputTokens: request.maxOutputTokens ?? null,
    governanceMaxOutputTokens: null,
    effectiveMaxOutputTokens: request.maxOutputTokens ?? null,
    budgetPolicyId: null,
  }
  const governanceMaxOutputTokens = positiveInteger(budget.maxOutputTokens, 'budget.maxOutputTokens')
  const callerRequestedMaxOutputTokens = request.maxOutputTokens == null ? null : positiveInteger(request.maxOutputTokens, 'request.maxOutputTokens')
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

  constructor(provider: ReasoningProvider, telemetry: TelemetryProvider, context: ObservableReasoningContext, budgetPolicy?: ReasoningBudgetPolicyProvider) {
    this.provider = provider
    this.telemetry = telemetry
    this.context = context
    this.budgetPolicy = budgetPolicy
    this.id = provider.id
  }

  async generateJson(request: ReasoningRequest): Promise<ReasoningResult> {
    const startedAt = Date.now()
    let budgetEvidence = applyProjectOutputBudget(request, null)
    try {
      if (this.budgetPolicy) {
        const projectBudget = await this.budgetPolicy.resolveProjectBudget(this.context.projectId)
        budgetEvidence = applyProjectOutputBudget(request, projectBudget)
      }
      const result = await this.provider.generateJson(budgetEvidence.request)
      try {
        await this.telemetry.record({
          projectId: this.context.projectId,
          eventType: 'MODEL_INVOCATION', operation: request.task, status: 'SUCCESS',
          providerId: result.provider, modelName: result.model,
          aiSystemId: this.context.aiSystemId ?? null, aiSystemVersionId: this.context.aiSystemVersionId ?? null,
          traceContext: this.context.traceContext ?? null, latencyMs: result.latencyMs,
          inputTokens: result.usage?.inputTokens ?? null, outputTokens: result.usage?.outputTokens ?? null,
          attributes: {
            task: request.task, route_source: this.context.routeSource, route_reason: this.context.routeReason,
            routing_policy_id: this.context.routingPolicyId ?? null, routing_policy_reason: this.context.routingPolicyReason ?? null,
            requested_max_output_tokens: budgetEvidence.callerRequestedMaxOutputTokens,
            governance_max_output_tokens: budgetEvidence.governanceMaxOutputTokens,
            effective_max_output_tokens: budgetEvidence.effectiveMaxOutputTokens,
            resource_budget_policy_id: budgetEvidence.budgetPolicyId,
            provider_request_id: result.providerRequestId ?? null, total_tokens: result.usage?.totalTokens ?? null,
          },
        })
      } catch {}
      return result
    } catch (error) {
      const providerHttpError = sanitizedProviderHttpFailure(error)
      try {
        await this.telemetry.record({
          projectId: this.context.projectId, eventType: 'MODEL_INVOCATION', operation: request.task, status: 'ERROR',
          providerId: this.provider.id, modelName: this.context.modelName ?? null,
          aiSystemId: this.context.aiSystemId ?? null, aiSystemVersionId: this.context.aiSystemVersionId ?? null,
          traceContext: this.context.traceContext ?? null, latencyMs: Math.max(0, Date.now() - startedAt),
          attributes: {
            task: request.task, route_source: this.context.routeSource, route_reason: this.context.routeReason,
            routing_policy_id: this.context.routingPolicyId ?? null, routing_policy_reason: this.context.routingPolicyReason ?? null,
            requested_max_output_tokens: budgetEvidence.callerRequestedMaxOutputTokens,
            governance_max_output_tokens: budgetEvidence.governanceMaxOutputTokens,
            effective_max_output_tokens: budgetEvidence.effectiveMaxOutputTokens,
            resource_budget_policy_id: budgetEvidence.budgetPolicyId,
            error_name: error instanceof Error ? error.name : 'UnknownError',
            provider_http_status: providerHttpError?.status ?? null,
            provider_request_id: providerHttpError?.providerRequestId ?? null,
          },
        })
      } catch {}
      throw error
    }
  }
}

export class ObservableIntelligentRouter implements IntelligentModelRouter {
  constructor(
    private readonly router: IntelligentModelRouter,
    private readonly telemetry: TelemetryProvider,
    private readonly budgetPolicy?: ReasoningBudgetPolicyProvider,
  ) {}

  async route(context: IntelligentRouteContext): Promise<IntelligentRouteDecision> {
    const startedAt = Date.now()
    const decision = await this.router.route(context)
    try {
      await this.telemetry.record({
        projectId: context.projectId, eventType: 'AI_ROUTE_DECISION', operation: 'model_route',
        status: decision.source === 'UNAVAILABLE' ? 'ERROR' : 'SUCCESS', providerId: decision.provider?.id ?? null,
        modelName: decision.evidence?.modelName ?? null, aiSystemId: decision.evidence?.aiSystemId ?? null,
        aiSystemVersionId: decision.evidence?.aiSystemVersionId ?? null, traceContext: context.traceContext ?? null,
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
    } catch {}
    if (!decision.provider) return decision
    return {
      ...decision,
      provider: new ObservableReasoningProvider(decision.provider, this.telemetry, {
        projectId: context.projectId, aiSystemId: decision.evidence?.aiSystemId ?? null,
        aiSystemVersionId: decision.evidence?.aiSystemVersionId ?? null, modelName: decision.evidence?.modelName ?? null,
        routingPolicyId: decision.evidence?.routingPolicyId ?? null, routingPolicyReason: decision.evidence?.routingPolicyReason ?? null,
        traceContext: context.traceContext ?? null, routeSource: decision.source, routeReason: decision.reason,
      }, this.budgetPolicy),
    }
  }
}
