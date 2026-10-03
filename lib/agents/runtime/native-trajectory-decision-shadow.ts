import { isJevShadowRuntimeEnabled } from '../../ai/decision-runtime.ts'
import { getDecisionDefinition } from '../../ai/decision-registry.ts'

export async function observeNativeTrajectoryDecisionShadow(input: {
  projectId: string
  agentRunId: string
  deterministicScore: number
  dimensions: Record<string, unknown>
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
      definition: getDecisionDefinition('AGENT_TRACE_EVALUATION'),
      state: {
        deterministicScore: input.deterministicScore,
        dimensions: input.dimensions,
        evidenceAuthority: 'DETERMINISTIC_RUNTIME_EVIDENCE',
      },
    })
  } catch {
    // Shadow evaluation is supplementary evidence only. It cannot rewrite the
    // deterministic trajectory score or its persisted outcome.
    return null
  }
}
