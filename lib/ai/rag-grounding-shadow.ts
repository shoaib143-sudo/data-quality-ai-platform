import { isJevShadowRuntimeEnabled } from './decision-runtime.ts'
import { getDecisionDefinition } from './decision-registry.ts'

export type RagGroundingShadowEvidence = {
  citationId: string
  authority: string
  content: string
}

export async function observeRagGroundingShadow(input: {
  projectId: string
  claimId: string
  claim: string
  evidence: RagGroundingShadowEvidence[]
  correlationId?: string | null
}) {
  if (!input.claim.trim()) throw new Error('RAG grounding shadow requires a non-empty claim.')
  if (!input.evidence.length) return null

  if (!isJevShadowRuntimeEnabled()) return null
  const { createGovernanceShadowDecisionGateway } = await import('./governance-decision-runtime.ts' )
  const gateway = createGovernanceShadowDecisionGateway({ projectId: input.projectId })
  if (!gateway) return null

  try {
    return await gateway.evaluate({
      definition: getDecisionDefinition('RAG_GROUNDING'),
      correlationId: input.correlationId ?? null,
      state: {
        claimId: input.claimId,
        claim: input.claim,
        evidence: input.evidence.map(item => ({
          citationId: item.citationId,
          authority: item.authority,
          content: item.content,
        })),
      },
    })
  } catch {
    // Grounding remains shadow evidence. A provider failure cannot convert an
    // unsupported claim into a supported one or bypass deterministic provenance.
    return null
  }
}
