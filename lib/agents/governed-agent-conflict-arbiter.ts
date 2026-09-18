import {
  isGovernedAgentKey,
  type GovernedAgentKey,
} from './governed-agent-registry'

export type GovernedAgentEvidenceStrength = 'LOW' | 'MEDIUM' | 'HIGH'

export type GovernedAgentPosition = {
  agentKey: GovernedAgentKey
  statement: string
  evidenceRefs: readonly string[]
  evidenceStrength: GovernedAgentEvidenceStrength
}

export type GovernedConflictStatus =
  | 'CONSENSUS'
  | 'INSUFFICIENT_CORROBORATION'
  | 'CONFLICT_REQUIRES_REVIEW'

export type GovernedConflictResolution = {
  arbiterVersion: '1.0'
  correlationId: string
  scopeKey: string
  status: GovernedConflictStatus
  normalizedStatements: string[]
  positions: Array<{
    agentKey: GovernedAgentKey
    statement: string
    evidenceRefs: string[]
    evidenceStrength: GovernedAgentEvidenceStrength
  }>
  consensusStatement: string | null
  reasons: string[]
  requiresHumanReview: boolean
  autoResolveAllowed: false
  authorityExpansionAllowed: false
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function normalizeStatement(value: string) {
  return requiredText(value, 'position.statement')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim()
}

function uniqueRefs(values: readonly string[], agentKey: GovernedAgentKey) {
  const refs = values.map((value) => requiredText(value, `evidenceRef for ${agentKey}`))
  if (!refs.length) throw new Error(`At least one evidence reference is required for ${agentKey}`)
  if (new Set(refs).size !== refs.length) throw new Error(`Evidence references must be unique for ${agentKey}`)
  return [...refs].sort()
}

export function arbitrateGovernedAgentConflict(input: {
  correlationId: string
  scopeKey: string
  positions: readonly GovernedAgentPosition[]
}): GovernedConflictResolution {
  const correlationId = requiredText(input.correlationId, 'correlationId')
  const scopeKey = requiredText(input.scopeKey, 'scopeKey')
  if (!Array.isArray(input.positions) || input.positions.length < 1) {
    throw new Error('At least one governed agent position is required')
  }

  const seenAgents = new Set<GovernedAgentKey>()
  const positions = input.positions.map((position) => {
    if (!isGovernedAgentKey(position.agentKey)) throw new Error(`Unknown governed agent: ${String(position.agentKey)}`)
    if (seenAgents.has(position.agentKey)) throw new Error(`Duplicate governed agent position: ${position.agentKey}`)
    seenAgents.add(position.agentKey)

    return {
      agentKey: position.agentKey,
      statement: requiredText(position.statement, `statement for ${position.agentKey}`),
      evidenceRefs: uniqueRefs(position.evidenceRefs, position.agentKey),
      evidenceStrength: position.evidenceStrength,
    }
  })

  const normalizedStatements = [...new Set(positions.map((position) => normalizeStatement(position.statement)))].sort()

  if (positions.length === 1) {
    return {
      arbiterVersion: '1.0',
      correlationId,
      scopeKey,
      status: 'INSUFFICIENT_CORROBORATION',
      normalizedStatements,
      positions,
      consensusStatement: null,
      reasons: ['A single specialist position is not independently corroborated.'],
      requiresHumanReview: false,
      autoResolveAllowed: false,
      authorityExpansionAllowed: false,
    }
  }

  if (normalizedStatements.length === 1) {
    return {
      arbiterVersion: '1.0',
      correlationId,
      scopeKey,
      status: 'CONSENSUS',
      normalizedStatements,
      positions,
      consensusStatement: positions[0].statement,
      reasons: ['Multiple governed agents independently produced the same normalized conclusion.'],
      requiresHumanReview: false,
      autoResolveAllowed: false,
      authorityExpansionAllowed: false,
    }
  }

  return {
    arbiterVersion: '1.0',
    correlationId,
    scopeKey,
    status: 'CONFLICT_REQUIRES_REVIEW',
    normalizedStatements,
    positions,
    consensusStatement: null,
    reasons: [
      'Governed agents produced materially different conclusions for the same scope.',
      'The arbiter preserves all evidence-backed positions and does not select a winner from heuristic evidence strength.',
    ],
    requiresHumanReview: true,
    autoResolveAllowed: false,
    authorityExpansionAllowed: false,
  }
}
