import { randomUUID } from 'node:crypto'
import type { DecisionReceipt, DecisionReceiptSink } from './decision-gateway.ts'
import type { TelemetryProvider } from './telemetry-provider.ts'
import type { ModelCostAccountingProvider } from './cost-accounting'

export class DecisionTelemetryReceiptSink implements DecisionReceiptSink {
  private readonly telemetry: TelemetryProvider
  private readonly costAccounting?: ModelCostAccountingProvider
  private readonly context: {
    projectId: string
    agentRunId?: string | null
    aiSystemId?: string | null
    aiSystemVersionId?: string | null
  }

  constructor(input: {
    telemetry: TelemetryProvider
    costAccounting?: ModelCostAccountingProvider
    projectId: string
    agentRunId?: string | null
    aiSystemId?: string | null
    aiSystemVersionId?: string | null
  }) {
    this.telemetry = input.telemetry
    this.costAccounting = input.costAccounting
    this.context = {
      projectId: input.projectId.trim(),
      agentRunId: input.agentRunId ?? null,
      aiSystemId: input.aiSystemId ?? null,
      aiSystemVersionId: input.aiSystemVersionId ?? null,
    }
    if (!this.context.projectId) throw new Error('projectId is required for decision telemetry')
  }

  async record(receipt: DecisionReceipt): Promise<void> {
    if (this.costAccounting) {
      try {
        await this.costAccounting.recordInvocation({
          invocationId: randomUUID(),
          projectId: this.context.projectId,
          executionCorrelationId: receipt.correlationId,
          providerRequestId: receipt.providerRequestId,
          providerId: receipt.provider,
          modelName: receipt.model,
          usage: {
            inputTokens: receipt.usage.inputTokens,
            outputTokens: receipt.usage.outputTokens,
            totalTokens: receipt.usage.inputTokens + receipt.usage.outputTokens,
          },
          observedAt: receipt.createdAt,
        })
      } catch {
        // Shadow cost evidence is best effort. Cost-accounting failure cannot
        // convert semantic observation into execution authority or block runtime.
      }
    }

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
