import { isJevShadowRuntimeEnabled } from './decision-runtime.ts'
import { getDecisionDefinition } from './decision-registry.ts'

export async function observePromptSecurityShadow(input: {
  projectId: string
  text: string
  source: string
  correlationId?: string | null
}) {
  if (!isJevShadowRuntimeEnabled()) return null
  const { createGovernanceShadowDecisionGateway } = await import('./governance-decision-runtime.ts' )
  const gateway = createGovernanceShadowDecisionGateway({ projectId: input.projectId })
  if (!gateway) return null

  try {
    return await gateway.evaluate({
      definition: getDecisionDefinition('PROMPT_SECURITY'),
      correlationId: input.correlationId ?? null,
      state: {
        source: input.source,
        content: input.text,
      },
    })
  } catch {
    // Prompt security is observational while SHADOW. Provider failure cannot
    // change the canonical authorization or response path until promotion.
    return null
  }
}
