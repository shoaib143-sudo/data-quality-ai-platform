import { createGovernanceTelemetryProvider } from './governance-telemetry-provider'
import { DecisionGateway } from './decision-gateway.ts'
import { DecisionPayloadBuilder } from './decision-payload-builder.ts'
import { DecisionTelemetryReceiptSink } from './decision-telemetry.ts'
import { getJevDecisionProvider } from './jev-decision-provider.ts'

export function createGovernanceShadowDecisionGateway(input: {
  projectId: string
  agentRunId?: string | null
  aiSystemId?: string | null
  aiSystemVersionId?: string | null
}) {
  const provider = getJevDecisionProvider()
  if (!provider) return null

  return new DecisionGateway({
    provider,
    payloadBuilder: new DecisionPayloadBuilder(),
    receiptSink: new DecisionTelemetryReceiptSink({
      telemetry: createGovernanceTelemetryProvider(),
      projectId: input.projectId,
      agentRunId: input.agentRunId,
      aiSystemId: input.aiSystemId,
      aiSystemVersionId: input.aiSystemVersionId,
    }),
  })
}
