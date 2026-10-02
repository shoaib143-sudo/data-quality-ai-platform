import type { DecisionReceipt, DecisionReceiptSink } from './decision-gateway.ts'
import type { TelemetryProvider } from './telemetry-provider.ts'

export class DecisionTelemetryReceiptSink implements DecisionReceiptSink {
  private readonly telemetry: TelemetryProvider
  private readonly context: {
    projectId: string
    agentRunId?: string | null
    aiSystemId?: string | null
    aiSystemVersionId?: string | null
  }

  constructor(input: {
    telemetry: TelemetryProvider
    projectId: string
    agentRunId?: string | null
    aiSystemId?: string | null
    aiSystemVersionId?: string | null
  }) {
    this.telemetry = input.telemetry
    this.context = {
      projectId: input.projectId.trim(),
      agentRunId: input.agentRunId ?? null,
      aiSystemId: input.aiSystemId ?? null,
      aiSystemVersionId: input.aiSystemVersionId ?? null,
    }
    if (!this.context.projectId) throw new Error('projectId is required for decision telemetry')
  }

  async record(receipt: DecisionReceipt): Promise<void> {
    await this.telemetry.record({
      projectId: this.context.projectId,
      eventType: 'SEMANTIC_DECISION',
      operation: receipt.decisionFamily,
      status: receipt.policy.band === 'CONFIDENT' ? 'SUCCESS' : 'INFO',
      providerId: receipt.provider,
      modelName: receipt.model,
      agentRunId: this.context.agentRunId,
      aiSystemId: this.context.aiSystemId,
      aiSystemVersionId: this.context.aiSystemVersionId,
      correlationId: receipt.correlationId,
      latencyMs: receipt.latencyMs,
      inputTokens: receipt.usage.inputTokens,
      outputTokens: receipt.usage.outputTokens,
      attributes: {
        schemaVersion: receipt.schemaVersion,
        stateFingerprint: receipt.stateFingerprint,
        lifecycle: receipt.lifecycle,
        minimumObservedConfidence: receipt.policy.minimumObservedConfidence,
        confidenceBand: receipt.policy.band,
        semanticEnforcementEligible: receipt.policy.enforcementEligible,
        enforcementResult: receipt.enforcementResult,
      },
      observedAt: receipt.createdAt,
    })
  }
}
