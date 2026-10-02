import { createGovernanceTelemetryProvider } from './governance-telemetry-provider'
import { createGovernanceModelCostAccountingProvider } from './governance-cost-accounting'
import { DecisionGateway } from './decision-gateway.ts'
import { DecisionPayloadBuilder } from './decision-payload-builder.ts'
import { DecisionTelemetryReceiptSink } from './decision-telemetry.ts'
import { getJevDecisionProvider } from './jev-decision-provider.ts'
import { isJevShadowRuntimeEnabled } from './decision-runtime.ts'

export function createGovernanceShadowDecisionGateway(input: {
  projectId: string
  agentRunId?: string | null
  aiSystemId?: string | null
  aiSystemVersionId?: string | null
}) {
  if (!isJevShadowRuntimeEnabled()) return null
  const provider = getJevDecisionProvider()
  if (!provider) return null

  return new DecisionGateway({
    provider,
    payloadBuilder: new DecisionPayloadBuilder(),
    receiptSink: new DecisionTelemetryReceiptSink({
      telemetry: createGovernanceTelemetryProvider(),
      costAccounting: createGovernanceModelCostAccountingProvider(),
      projectId: input.projectId,
      agentRunId: input.agentRunId,
      aiSystemId: input.aiSystemId,
      aiSystemVersionId: input.aiSystemVersionId,
    }),
  })
}
