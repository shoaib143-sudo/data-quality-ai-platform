import type {
  IntelligentModelRouter,
  IntelligentRouteContext,
  IntelligentRouteDecision,
} from './intelligent-router'
import {
  ReasoningProviderHttpError,
  type ReasoningProvider,
  type ReasoningRequest,
  type ReasoningResult,
} from './reasoning-provider'
import type { TelemetryProvider, TelemetryTraceContext } from './telemetry-provider'

type ObservableReasoningContext = {
  projectId: string
  aiSystemId?: string | null
  aiSystemVersionId?: string | null
  traceContext?: TelemetryTraceContext | null
  routeSource: string
  routeReason: string
}

class ObservableReasoningProvider implements ReasoningProvider {
  readonly id: string
  private readonly provider: ReasoningProvider
  private readonly telemetry: TelemetryProvider
  private readonly context: ObservableReasoningContext

  constructor(provider: ReasoningProvider, telemetry: TelemetryProvider, context: ObservableReasoningContext) {
    this.provider = provider
    this.telemetry = telemetry
    this.context = context
    this.id = provider.id
  }

  async generateJson(request: ReasoningRequest): Promise<ReasoningResult> {
    const startedAt = Date.now()
    try {
      const result = await this.provider.generateJson(request)
      try {
        await this.telemetry.record({
          projectId: this.context.projectId,
          eventType: 'MODEL_INVOCATION',
          operation: request.task,
          status: 'SUCCESS',
          providerId: result.provider,
          modelName: result.model,
          aiSystemId: this.context.aiSystemId ?? null,
          aiSystemVersionId: this.context.aiSystemVersionId ?? null,
          traceContext: this.context.traceContext ?? null,
          latencyMs: result.latencyMs,
          inputTokens: result.usage?.inputTokens ?? null,
          outputTokens: result.usage?.outputTokens ?? null,
          attributes: {
            task: request.task,
            route_source: this.context.routeSource,
            route_reason: this.context.routeReason,
            provider_request_id: result.providerRequestId ?? null,
            total_tokens: result.usage?.totalTokens ?? null,
          },
        })
      } catch {
        // Telemetry is observability evidence only. A telemetry failure must not
        // change or invalidate a completed model result.
      }
      return result
    } catch (error) {
      const providerHttpError = error instanceof ReasoningProviderHttpError ? error : null
      try {
        await this.telemetry.record({
          projectId: this.context.projectId,
          eventType: 'MODEL_INVOCATION',
          operation: request.task,
          status: 'ERROR',
          providerId: this.provider.id,
          aiSystemId: this.context.aiSystemId ?? null,
          aiSystemVersionId: this.context.aiSystemVersionId ?? null,
          traceContext: this.context.traceContext ?? null,
          latencyMs: Math.max(0, Date.now() - startedAt),
          attributes: {
            task: request.task,
            route_source: this.context.routeSource,
            route_reason: this.context.routeReason,
            error_name: error instanceof Error ? error.name : 'UnknownError',
            provider_http_status: providerHttpError?.status ?? null,
            provider_request_id: providerHttpError?.providerRequestId ?? null,
          },
        })
      } catch {
        // Telemetry outages never convert or suppress provider failures.
      }
      throw error
    }
  }
}

export class ObservableIntelligentRouter implements IntelligentModelRouter {
  private readonly router: IntelligentModelRouter
  private readonly telemetry: TelemetryProvider

  constructor(router: IntelligentModelRouter, telemetry: TelemetryProvider) {
    this.router = router
    this.telemetry = telemetry
  }

  async route(context: IntelligentRouteContext): Promise<IntelligentRouteDecision> {
    const startedAt = Date.now()
    const decision = await this.router.route(context)

    try {
      await this.telemetry.record({
        projectId: context.projectId,
        eventType: 'AI_ROUTE_DECISION',
        operation: 'model_route',
        status: decision.source === 'UNAVAILABLE' ? 'ERROR' : 'SUCCESS',
        providerId: decision.provider?.id ?? null,
        modelName: decision.evidence?.modelName ?? null,
        aiSystemId: decision.evidence?.aiSystemId ?? null,
        aiSystemVersionId: decision.evidence?.aiSystemVersionId ?? null,
        traceContext: context.traceContext ?? null,
        latencyMs: Math.max(0, Date.now() - startedAt),
        attributes: {
          task: context.task,
          sensitivity: context.sensitivity ?? null,
          risk: context.risk ?? null,
          route_source: decision.source,
          route_reason: decision.reason,
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
        projectId: context.projectId,
        aiSystemId: decision.evidence?.aiSystemId ?? null,
        aiSystemVersionId: decision.evidence?.aiSystemVersionId ?? null,
        traceContext: context.traceContext ?? null,
        routeSource: decision.source,
        routeReason: decision.reason,
      }),
    }
  }
}
