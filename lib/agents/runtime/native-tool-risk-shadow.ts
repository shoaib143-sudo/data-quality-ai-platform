import { isJevShadowRuntimeEnabled } from '../../ai/decision-runtime.ts'
import { getDecisionDefinition } from '../../ai/decision-registry.ts'

export async function observeNativeToolRiskShadow(input: {
  projectId: string
  agentRunId: string
  agentKey: string
  toolKey: string
  stepId: string
  riskTier: number
  objective?: string | null
  toolInput: Record<string, unknown>
  correlationId?: string | null
}) {
  if (!isJevShadowRuntimeEnabled()) return null
  const { createGovernanceShadowDecisionGateway } = await import('../../ai/governance-decision-runtime.ts')
  const gateway = createGovernanceShadowDecisionGateway({
    projectId: input.projectId,
    agentRunId: input.agentRunId,
  })
  if (!gateway) return null

  try {
    return await gateway.evaluate({
      definition: getDecisionDefinition('TOOL_RISK'),
      correlationId: input.correlationId ?? null,
      state: {
        agent: input.agentKey,
        tool: input.toolKey,
        step: input.stepId,
        riskTier: input.riskTier,
        objective: input.objective ?? null,
        input: input.toolInput,
      },
    })
  } catch {
    // Shadow mode is observational only. Provider failure must not alter the
    // deterministic execution result before this family is explicitly promoted.
    return null
  }
}
