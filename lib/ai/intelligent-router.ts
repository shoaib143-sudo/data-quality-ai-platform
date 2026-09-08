import type {
  ReasoningProvider,
  ReasoningProviderSelection,
} from './reasoning-provider'
import type { ModelGateway, ReasoningRouteContext } from './model-gateway'
import type { ModelRegistry, RegisteredModelVersion } from './model-registry'

export type IntelligentRouteContext = ReasoningRouteContext & {
  projectId: string
}

export type GovernedRouteEvidence = {
  aiSystemId: string
  aiSystemVersionId: string
  systemKey: string
  provider: string
  modelName: string
  evaluationAverageScore: number | null
  evaluationScoredCount: number
  evaluationPassRate: number | null
}

export type IntelligentRouteDecision =
  | {
      source: 'GOVERNED_REGISTRY'
      reason: 'ACTIVE_GOVERNED_CANDIDATE_SELECTED'
      provider: ReasoningProvider
      evidence: GovernedRouteEvidence
    }
  | {
      source: 'ENVIRONMENT_FALLBACK'
      reason: 'NO_ACTIVE_GOVERNED_CANDIDATES'
      provider: ReasoningProvider
      evidence: null
    }
  | {
      source: 'UNAVAILABLE'
      reason:
        | 'REGISTRY_UNAVAILABLE'
        | 'GOVERNED_CANDIDATES_NOT_EXECUTABLE'
        | 'NO_REASONING_PROVIDER_AVAILABLE'
      provider: null
      evidence: null
    }

export interface IntelligentModelRouter {
  route(context: IntelligentRouteContext): Promise<IntelligentRouteDecision>
}

export type IntelligentRouterDependencies = {
  registry: ModelRegistry
  fallbackGateway: ModelGateway
  createProvider: (selection: ReasoningProviderSelection) => ReasoningProvider | null
}

type RankedCandidate = {
  entry: RegisteredModelVersion
  averageScore: number | null
  scoredCount: number
  passRate: number | null
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function scoreCandidate(entry: RegisteredModelVersion): RankedCandidate {
  let weightedScore = 0
  let scoredCount = 0
  let passCount = 0
  let passFailCount = 0

  for (const metric of entry.evaluationScorecard) {
    if (metric.averageScore !== null && metric.scoredCount > 0) {
      weightedScore += metric.averageScore * metric.scoredCount
      scoredCount += metric.scoredCount
    }
    passCount += metric.passCount
    passFailCount += metric.passCount + metric.failCount
  }

  return {
    entry,
    averageScore: scoredCount > 0 ? weightedScore / scoredCount : null,
    scoredCount,
    passRate: passFailCount > 0 ? passCount / passFailCount : null,
  }
}

function compareCandidates(left: RankedCandidate, right: RankedCandidate) {
  const leftHasScore = left.averageScore !== null
  const rightHasScore = right.averageScore !== null
  if (leftHasScore !== rightHasScore) return leftHasScore ? -1 : 1

  if (left.averageScore !== null && right.averageScore !== null && left.averageScore !== right.averageScore) {
    return right.averageScore - left.averageScore
  }

  if (left.scoredCount !== right.scoredCount) return right.scoredCount - left.scoredCount

  if (left.passRate !== null && right.passRate !== null && left.passRate !== right.passRate) {
    return right.passRate - left.passRate
  }

  return left.entry.systemKey.localeCompare(right.entry.systemKey)
}

export class EvaluationAwareIntelligentRouter implements IntelligentModelRouter {
  private readonly dependencies: IntelligentRouterDependencies

  constructor(dependencies: IntelligentRouterDependencies) {
    this.dependencies = dependencies
  }

  async route(context: IntelligentRouteContext): Promise<IntelligentRouteDecision> {
    const projectId = requiredText(context.projectId, 'projectId')
    let candidates: RegisteredModelVersion[]

    try {
      candidates = await this.dependencies.registry.listCurrent({
        projectId,
        capability: context.task,
        routingEligibleOnly: true,
      })
    } catch {
      return {
        source: 'UNAVAILABLE',
        reason: 'REGISTRY_UNAVAILABLE',
        provider: null,
        evidence: null,
      }
    }

    if (candidates.length === 0) {
      const fallback = this.dependencies.fallbackGateway.reasoning(context)
      if (!fallback) {
        return {
          source: 'UNAVAILABLE',
          reason: 'NO_REASONING_PROVIDER_AVAILABLE',
          provider: null,
          evidence: null,
        }
      }
      return {
        source: 'ENVIRONMENT_FALLBACK',
        reason: 'NO_ACTIVE_GOVERNED_CANDIDATES',
        provider: fallback,
        evidence: null,
      }
    }

    const ranked = candidates.map(scoreCandidate).sort(compareCandidates)

    for (const candidate of ranked) {
      const providerId = candidate.entry.provider?.trim()
      const modelName = candidate.entry.modelName?.trim()
      if (!providerId || !modelName) continue

      try {
        const provider = this.dependencies.createProvider({ providerId, model: modelName })
        if (!provider) continue
        return {
          source: 'GOVERNED_REGISTRY',
          reason: 'ACTIVE_GOVERNED_CANDIDATE_SELECTED',
          provider,
          evidence: {
            aiSystemId: candidate.entry.aiSystemId,
            aiSystemVersionId: candidate.entry.aiSystemVersionId,
            systemKey: candidate.entry.systemKey,
            provider: providerId,
            modelName,
            evaluationAverageScore: candidate.averageScore,
            evaluationScoredCount: candidate.scoredCount,
            evaluationPassRate: candidate.passRate,
          },
        }
      } catch {
        // Try the next already-authorized governed candidate. Never fall back to an
        // ungoverned environment route once ACTIVE governed candidates exist.
      }
    }

    return {
      source: 'UNAVAILABLE',
      reason: 'GOVERNED_CANDIDATES_NOT_EXECUTABLE',
      provider: null,
      evidence: null,
    }
  }
}
