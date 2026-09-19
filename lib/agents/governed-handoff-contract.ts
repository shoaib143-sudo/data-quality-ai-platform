import {
  getGovernedAgentPolicy,
  isGovernedAgentKey,
  type GovernedAgentKey,
} from './governed-agent-registry'

export type GovernedHandoffConfidence = 'LOW' | 'MEDIUM' | 'HIGH' | 'UNSPECIFIED'

export type GovernedHandoffEnvelope = {
  contractVersion: '1.0'
  correlationId: string
  sourceAgentKey: GovernedAgentKey
  targetAgentKey: GovernedAgentKey
  objective: string
  establishedFacts: string[]
  hypotheses: string[]
  unresolvedQuestions: string[]
  evidenceRefs: string[]
  requestedSkill: string | null
  confidence: GovernedHandoffConfidence
  authorityContext: {
    sourceAuthority: string
    sourceMutationBoundary: string
    targetAuthority: string
    targetMutationBoundary: string
  }
  requiresFreshAuthorization: true
  autoExecute: false
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function normalizedUnique(values: readonly string[], label: string, max: number) {
  if (values.length > max) throw new Error(`${label} exceeds maximum of ${max}`)
  const normalized = values.map((value) => requiredText(value, label))
  if (new Set(normalized).size !== normalized.length) throw new Error(`${label} must be unique`)
  return normalized
}

export function createGovernedHandoffEnvelope(input: {
  correlationId: string
  sourceAgentKey: GovernedAgentKey
  targetAgentKey: GovernedAgentKey
  objective: string
  establishedFacts?: readonly string[]
  hypotheses?: readonly string[]
  unresolvedQuestions?: readonly string[]
  evidenceRefs: readonly string[]
  requestedSkill?: string | null
  confidence?: GovernedHandoffConfidence
}): GovernedHandoffEnvelope {
  if (!isGovernedAgentKey(input.sourceAgentKey)) throw new Error(`Unknown source agent: ${String(input.sourceAgentKey)}`)
  if (!isGovernedAgentKey(input.targetAgentKey)) throw new Error(`Unknown target agent: ${String(input.targetAgentKey)}`)
  if (input.sourceAgentKey === input.targetAgentKey) throw new Error('Governed handoff target must differ from source agent')

  const sourcePolicy = getGovernedAgentPolicy(input.sourceAgentKey)
  if (!sourcePolicy.handoffTargets.includes(input.targetAgentKey)) {
    throw new Error(`Handoff from ${input.sourceAgentKey} to ${input.targetAgentKey} is not allowed by policy`)
  }
  const targetPolicy = getGovernedAgentPolicy(input.targetAgentKey)

  const evidenceRefs = normalizedUnique(input.evidenceRefs, 'evidenceRefs', 50)
  if (!evidenceRefs.length) throw new Error('At least one evidence reference is required for a governed handoff')

  return {
    contractVersion: '1.0',
    correlationId: requiredText(input.correlationId, 'correlationId'),
    sourceAgentKey: input.sourceAgentKey,
    targetAgentKey: input.targetAgentKey,
    objective: requiredText(input.objective, 'objective'),
    establishedFacts: normalizedUnique(input.establishedFacts ?? [], 'establishedFacts', 20),
    hypotheses: normalizedUnique(input.hypotheses ?? [], 'hypotheses', 20),
    unresolvedQuestions: normalizedUnique(input.unresolvedQuestions ?? [], 'unresolvedQuestions', 20),
    evidenceRefs,
    requestedSkill: input.requestedSkill == null ? null : requiredText(input.requestedSkill, 'requestedSkill'),
    confidence: input.confidence ?? 'UNSPECIFIED',
    authorityContext: {
      sourceAuthority: sourcePolicy.authority,
      sourceMutationBoundary: sourcePolicy.mutationBoundary,
      targetAuthority: targetPolicy.authority,
      targetMutationBoundary: targetPolicy.mutationBoundary,
    },
    requiresFreshAuthorization: true,
    autoExecute: false,
  }
}
