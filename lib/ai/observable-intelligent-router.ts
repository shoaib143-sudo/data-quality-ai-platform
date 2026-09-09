import type {
  IntelligentModelRouter,
  IntelligentRouteContext,
  IntelligentRouteDecision,
} from './intelligent-router'
import { ObservableReasoningProvider } from './observable-reasoning-provider'
import type { TelemetryProvider } from './telemetry-provider'

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
