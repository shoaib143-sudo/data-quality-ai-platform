import type {
  IntelligentModelRouter,
  IntelligentRouteContext,
  IntelligentRouteDecision,
} from './intelligent-router'
import type { ReasoningProvider, ReasoningRequest, ReasoningResult } from './reasoning-provider'
import type { TelemetryProvider } from './telemetry-provider'
import { assertValidReasoningOutput, ReasoningOutputValidationError } from './task-contract'

class OutputValidatedReasoningProvider implements ReasoningProvider {
  readonly id: string
  private readonly provider: ReasoningProvider
  private readonly telemetry: TelemetryProvider
  private readonly context: IntelligentRouteContext

  constructor(provider: ReasoningProvider, telemetry: TelemetryProvider, context: IntelligentRouteContext) {
    this.provider = provider
    this.telemetry = telemetry
    this.context = context
    this.id = provider.id
  }

  async generateJson(request: ReasoningRequest): Promise<ReasoningResult> {
    let result: ReasoningResult | null = null
    try {
      result = await this.provider.generateJson(request)
      const validation = assertValidReasoningOutput(request.task, result.result)
      try {
        await this.telemetry.record({
          projectId: this.context.projectId,
          eventType: 'MODEL_OUTPUT_VALIDATION',
          operation: request.task,
          status: 'SUCCESS',
          providerId: result.provider,
          modelName: result.model,
          correlationId: this.context.executionCorrelationId ?? null,
          traceContext: this.context.traceContext ?? null,
          latencyMs: 0,
          attributes: {
            contract_id: validation.contractId,
            contract_version: validation.contractVersion,
            validator_version: validation.validatorVersion,
            output_bytes: validation.outputBytes,
            issue_codes: [],
            raw_output_persisted: false,
          },
        })
      } catch {
        // Validation authority is local and fail-closed. Telemetry is evidence only.
      }
      return result
    } catch (error) {
      if (error instanceof ReasoningOutputValidationError) {
        try {
          await this.telemetry.record({
            projectId: this.context.projectId,
            eventType: 'MODEL_OUTPUT_VALIDATION',
            operation: request.task,
            status: 'ERROR',
            providerId: result?.provider ?? this.provider.id,
            modelName: result?.model ?? null,
            correlationId: this.context.executionCorrelationId ?? null,
            traceContext: this.context.traceContext ?? null,
            latencyMs: 0,
            attributes: {
              contract_id: error.validation.contractId,
              contract_version: error.validation.contractVersion,
              validator_version: error.validation.validatorVersion,
              output_bytes: error.validation.outputBytes,
              issue_codes: error.validation.issues.map((issue) => issue.code),
              issue_paths: error.validation.issues.map((issue) => issue.path),
              raw_output_persisted: false,
            },
          })
        } catch {
          // Do not replace the validation failure with an observability failure.
        }
      }
      throw error
    }
  }
}

export class OutputValidatedIntelligentRouter implements IntelligentModelRouter {
  private readonly router: IntelligentModelRouter
  private readonly telemetry: TelemetryProvider

  constructor(router: IntelligentModelRouter, telemetry: TelemetryProvider) {
    this.router = router
    this.telemetry = telemetry
  }

  async route(context: IntelligentRouteContext): Promise<IntelligentRouteDecision> {
    const decision = await this.router.route(context)
    if (!decision.provider) return decision
    return {
      ...decision,
      provider: new OutputValidatedReasoningProvider(decision.provider, this.telemetry, context),
    }
  }
}
