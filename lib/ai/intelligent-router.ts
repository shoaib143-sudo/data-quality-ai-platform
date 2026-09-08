import type {
  ReasoningProvider,
  ReasoningProviderSelection,
} from './reasoning-provider'
import type { ModelGateway, ReasoningRouteContext } from './model-gateway'
import type { ModelRegistry, RegisteredModelVersion } from './model-registry'
import type { RoutingPolicy, RoutingPolicyEvaluator, RoutingPolicyProvider } from './routing-policy'
import type { TelemetryTraceContext } from './telemetry-provider'

export type IntelligentRouteContext = ReasoningRouteContext & {
  projectId: string
  traceContext?: TelemetryTraceContext | null
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
  routingPolicyId: string | null
  routingPolicyReason: string
}

export type IntelligentRouteDecision =
  | { source: 'GOVERNED_REGISTRY'; reason: 'ACTIVE_GOVERNED_CANDIDATE_SELECTED'; provider: ReasoningProvider; evidence: GovernedRouteEvidence }
  | { source: 'ENVIRONMENT_FALLBACK'; reason: 'NO_ACTIVE_GOVERNED_CANDIDATES'; provider: ReasoningProvider; evidence: null }
  | { source: 'UNAVAILABLE'; reason: 'ROUTING_POLICY_UNAVAILABLE' | 'REGISTRY_UNAVAILABLE' | 'POLICY_DENIED_ENVIRONMENT_FALLBACK' | 'NO_GOVERNED_CANDIDATES_SATISFY_POLICY' | 'GOVERNED_CANDIDATES_NOT_EXECUTABLE' | 'NO_REASONING_PROVIDER_AVAILABLE'; provider: null; evidence: null }

export interface IntelligentModelRouter { route(context: IntelligentRouteContext): Promise<IntelligentRouteDecision> }

export type IntelligentRouterDependencies = {
  registry: ModelRegistry
  routingPolicy: RoutingPolicyProvider
  evaluatePolicy: RoutingPolicyEvaluator
  fallbackGateway: ModelGateway
  createProvider: (selection: ReasoningProviderSelection) => ReasoningProvider | null
}

type RankedCandidate = {
  entry: RegisteredModelVersion
  averageScore: number | null
  scoredCount: number
  passRate: number | null
  policyReason: string
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function scoreCandidate(entry: RegisteredModelVersion): Omit<RankedCandidate, 'policyReason'> {
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
  if (left.averageScore !== null && right.averageScore !== null && left.averageScore !== right.averageScore) return right.averageScore - left.averageScore
  if (left.scoredCount !== right.scoredCount) return right.scoredCount - left.scoredCount
  if (left.passRate !== null && right.passRate !== null && left.passRate !== right.passRate) return right.passRate - left.passRate
  return left.entry.systemKey.localeCompare(right.entry.systemKey)
}

function activePolicy(policy: RoutingPolicy | null) { return policy?.enabled ? policy : null }

export class EvaluationAwareIntelligentRouter implements IntelligentModelRouter {
  private readonly dependencies: IntelligentRouterDependencies

  constructor(dependencies: IntelligentRouterDependencies) {
    this.dependencies = dependencies
  }

  async route(context: IntelligentRouteContext): Promise<IntelligentRouteDecision> {
    const projectId = requiredText(context.projectId, 'projectId')
    let policy: RoutingPolicy | null
    try {
      policy = await this.dependencies.routingPolicy.resolve({ projectId, task: context.task, sensitivity: context.sensitivity, risk: context.risk })
    } catch {
      return { source: 'UNAVAILABLE', reason: 'ROUTING_POLICY_UNAVAILABLE', provider: null, evidence: null }
    }

    let candidates: RegisteredModelVersion[]
    try {
      candidates = await this.dependencies.registry.listCurrent({ projectId, capability: context.task, routingEligibleOnly: true })
    } catch {
      return { source: 'UNAVAILABLE', reason: 'REGISTRY_UNAVAILABLE', provider: null, evidence: null }
    }

    const enforcedPolicy = activePolicy(policy)
    if (candidates.length === 0) {
      if (enforcedPolicy && !enforcedPolicy.allowEnvironmentFallback) return { source: 'UNAVAILABLE', reason: 'POLICY_DENIED_ENVIRONMENT_FALLBACK', provider: null, evidence: null }
      const fallback = this.dependencies.fallbackGateway.reasoning(context)
      if (!fallback) return { source: 'UNAVAILABLE', reason: 'NO_REASONING_PROVIDER_AVAILABLE', provider: null, evidence: null }
      return { source: 'ENVIRONMENT_FALLBACK', reason: 'NO_ACTIVE_GOVERNED_CANDIDATES', provider: fallback, evidence: null }
    }

    const ranked = candidates
      .map((entry) => {
        const scored = scoreCandidate(entry)
        const policyEvaluation = this.dependencies.evaluatePolicy(entry, policy, { averageScore: scored.averageScore, scoredCount: scored.scoredCount })
        return { ...scored, policyReason: policyEvaluation.reason, policyAllowed: policyEvaluation.allowed }
      })
      .filter((candidate) => candidate.policyAllowed)
      .sort(compareCandidates)

    if (ranked.length === 0) return { source: 'UNAVAILABLE', reason: 'NO_GOVERNED_CANDIDATES_SATISFY_POLICY', provider: null, evidence: null }

    for (const candidate of ranked) {
      const providerId = candidate.entry.provider?.trim()
      const modelName = candidate.entry.modelName?.trim()
      if (!providerId || !modelName) continue
      try {
        const provider = this.dependencies.createProvider({ providerId, model: modelName })
        if (!provider) continue
        return {
          source: 'GOVERNED_REGISTRY', reason: 'ACTIVE_GOVERNED_CANDIDATE_SELECTED', provider,
          evidence: {
            aiSystemId: candidate.entry.aiSystemId, aiSystemVersionId: candidate.entry.aiSystemVersionId,
            systemKey: candidate.entry.systemKey, provider: providerId, modelName,
            evaluationAverageScore: candidate.averageScore, evaluationScoredCount: candidate.scoredCount,
            evaluationPassRate: candidate.passRate, routingPolicyId: enforcedPolicy?.id ?? null,
            routingPolicyReason: candidate.policyReason,
          },
        }
      } catch {}
    }
    return { source: 'UNAVAILABLE', reason: 'GOVERNED_CANDIDATES_NOT_EXECUTABLE', provider: null, evidence: null }
  }
}
