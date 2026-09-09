import type {
  ReasoningProvider,
  ReasoningRequest,
  ReasoningResult,
} from './reasoning-provider'
import type { TelemetryProvider, TelemetryTraceContext } from './telemetry-provider'

export type ObservableReasoningContext = {
  projectId: string
  aiSystemId?: string | null
  aiSystemVersionId?: string | null
  traceContext?: TelemetryTraceContext | null
  routeSource: string
  routeReason: string
}

export class ObservableReasoningProvider implements ReasoningProvider {
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
          },
        })
      } catch {
        // Telemetry outages never convert or suppress provider failures.
      }
      throw error
    }
  }
}
