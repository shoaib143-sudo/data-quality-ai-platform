import type {
  IntelligentModelRouter,
  IntelligentRouteContext,
  IntelligentRouteDecision,
} from './intelligent-router'
import type { TelemetryProvider } from './telemetry-provider'

/**
 * Records failures that occur before the underlying router can return an
 * IntelligentRouteDecision. This is observation only: the original routing
 * error is always rethrown unchanged, and telemetry failure can never convert
 * a failed route into a usable decision.
 */
export class FailClosedRouteTelemetryRouter implements IntelligentModelRouter {
  private readonly router: IntelligentModelRouter
  private readonly telemetry: TelemetryProvider

  constructor(router: IntelligentModelRouter, telemetry: TelemetryProvider) {
    this.router = router
    this.telemetry = telemetry
  }

  async route(context: IntelligentRouteContext): Promise<IntelligentRouteDecision> {
    const startedAt = Date.now()
    try {
      return await this.router.route(context)
    } catch (error) {
      try {
        await this.telemetry.record({
          projectId: context.projectId,
          eventType: 'AI_ROUTE_DECISION',
          operation: 'model_route',
          status: 'ERROR',
          providerId: null,
          modelName: null,
          aiSystemId: null,
          aiSystemVersionId: null,
          correlationId: context.executionCorrelationId ?? null,
          traceContext: context.traceContext ?? null,
          latencyMs: Math.max(0, Date.now() - startedAt),
          attributes: {
            task: context.task,
            sensitivity: context.sensitivity ?? null,
            risk: context.risk ?? null,
            route_source: 'FAIL_CLOSED',
            route_reason: 'ROUTER_ERROR',
            routing_error_name: error instanceof Error ? error.name : 'UnknownError',
          },
        })
      } catch {
        // Telemetry is observational only. A telemetry outage must never replace,
        // suppress, or weaken the original fail-closed routing error.
      }
      throw error
    }
  }
}
