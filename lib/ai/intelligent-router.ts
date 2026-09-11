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
  executionCorrelationId?: string | null
  /** Explicit immutable agent-definition identity for ADR-008 AGENT budget scope matching. */
  agentDefinitionId?: string | null
  traceContext?: TelemetryTraceContext | null
}

export type RoutingEvidenceMode = 'CANONICAL_EVALUATION' | 'DETERMINISTIC_FALLBACK'
export type RoutingEvidenceFallbackReason =
  | 'NO_ACTIVE_POLICY'
  | 'EVALUATION_RANKING_NOT_CONFIGURED'
  | 'INCOMPLETE_COMPARABLE_EVIDENCE'
  | 'STALE_EVALUATION_EVIDENCE'
  | 'INSUFFICIENT_EVALUATION_EVIDENCE'
  | 'EVALUATION_SCORE_BELOW_POLICY_THRESHOLD'
  | null

export type GovernedRouteEvidence = {
  aiSystemId: string
  aiSystemVersionId: string
  systemKey: string
  provider: string
  modelName: string
  evaluationType: string | null
  evaluationMetricName: string | null
  evaluationAverageScore: number | null
  evaluationScoredCount: number
  evaluationPassRate: number | null
  evaluationEvidenceResultIds: string[]
  evaluationLastObservedAt: string | null
  evaluationMode: RoutingEvidenceMode
  evaluationFallbackReason: RoutingEvidenceFallbackReason
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
  now?: () => Date
}

type CandidateEvidence = {
  averageScore: number | null
  scoredCount: number
  passRate: number | null
  evidenceResultIds: string[]
  lastObservedAt: string | null
  fallbackReason: RoutingEvidenceFallbackReason
}

type RankedCandidate = {
  entry: RegisteredModelVersion
  evidence: CandidateEvidence
  policyReason: string
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function activePolicy(policy: RoutingPolicy | null) { return policy?.enabled ? policy : null }

function candidateEvidence(entry: RegisteredModelVersion, policy: RoutingPolicy | null, now: Date): CandidateEvidence {
  const enforcedPolicy = activePolicy(policy)
  if (!enforcedPolicy) {
    return { averageScore: null, scoredCount: 0, passRate: null, evidenceResultIds: [], lastObservedAt: null, fallbackReason: 'NO_ACTIVE_POLICY' }
  }
  if (!enforcedPolicy.evaluationType || !enforcedPolicy.evaluationMetricName) {
    return { averageScore: null, scoredCount: 0, passRate: null, evidenceResultIds: [], lastObservedAt: null, fallbackReason: 'EVALUATION_RANKING_NOT_CONFIGURED' }
  }

  const metrics = entry.evaluationScorecard.filter((metric) =>
    metric.evaluationType === enforcedPolicy.evaluationType
    && metric.metricName === enforcedPolicy.evaluationMetricName,
  )
  if (metrics.length !== 1) {
    return { averageScore: null, scoredCount: 0, passRate: null, evidenceResultIds: [], lastObservedAt: null, fallbackReason: 'INCOMPLETE_COMPARABLE_EVIDENCE' }
  }

  const metric = metrics[0]
  const passFailCount = metric.passCount + metric.failCount
  const lastObservedAt = metric.lastObservedAt ?? null
  if (enforcedPolicy.evaluationMaxAgeSeconds !== null) {
    const observedMs = lastObservedAt ? new Date(lastObservedAt).getTime() : Number.NaN
    const maxAgeMs = enforcedPolicy.evaluationMaxAgeSeconds * 1000
    if (!Number.isFinite(observedMs) || observedMs > now.getTime() || now.getTime() - observedMs > maxAgeMs) {
      return { averageScore: null, scoredCount: metric.scoredCount, passRate: passFailCount > 0 ? metric.passCount / passFailCount : null, evidenceResultIds: metric.evidenceResultIds ?? [], lastObservedAt, fallbackReason: 'STALE_EVALUATION_EVIDENCE' }
    }
  }
  if (metric.averageScore === null || metric.scoredCount < enforcedPolicy.minScoredCount) {
    return { averageScore: null, scoredCount: metric.scoredCount, passRate: passFailCount > 0 ? metric.passCount / passFailCount : null, evidenceResultIds: metric.evidenceResultIds ?? [], lastObservedAt, fallbackReason: 'INSUFFICIENT_EVALUATION_EVIDENCE' }
  }
  if (enforcedPolicy.minEvaluationScore !== null && metric.averageScore < enforcedPolicy.minEvaluationScore) {
    return { averageScore: null, scoredCount: metric.scoredCount, passRate: passFailCount > 0 ? metric.passCount / passFailCount : null, evidenceResultIds: metric.evidenceResultIds ?? [], lastObservedAt, fallbackReason: 'EVALUATION_SCORE_BELOW_POLICY_THRESHOLD' }
  }
  return {
    averageScore: metric.averageScore,
    scoredCount: metric.scoredCount,
    passRate: passFailCount > 0 ? metric.passCount / passFailCount : null,
    evidenceResultIds: metric.evidenceResultIds ?? [],
    lastObservedAt,
    fallbackReason: null,
  }
}

function deterministicCompare(left: RankedCandidate, right: RankedCandidate) {
  return left.entry.systemKey.localeCompare(right.entry.systemKey)
}

function evidenceCompare(left: RankedCandidate, right: RankedCandidate) {
  if (left.evidence.averageScore !== right.evidence.averageScore) {
    return (right.evidence.averageScore ?? 0) - (left.evidence.averageScore ?? 0)
  }
  return deterministicCompare(left, right)
}

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

    const now = this.dependencies.now?.() ?? new Date()
    const eligible = candidates
      .map((entry) => {
        const policyEvaluation = this.dependencies.evaluatePolicy(entry, policy)
        return {
          entry,
          evidence: candidateEvidence(entry, policy, now),
          policyReason: policyEvaluation.reason,
          policyAllowed: policyEvaluation.allowed,
        }
      })
      .filter((candidate) => candidate.policyAllowed)

    if (eligible.length === 0) return { source: 'UNAVAILABLE', reason: 'NO_GOVERNED_CANDIDATES_SATISFY_POLICY', provider: null, evidence: null }

    const comparableEvidence = eligible.length > 1 && eligible.every((candidate) => candidate.evidence.averageScore !== null)
    const ranked = [...eligible].sort(comparableEvidence ? evidenceCompare : deterministicCompare)

    for (const candidate of ranked) {
      const providerId = candidate.entry.provider?.trim()
      const modelName = candidate.entry.modelName?.trim()
      if (!providerId || !modelName) continue
      try {
        const provider = this.dependencies.createProvider({ providerId, model: modelName })
        if (!provider) continue
        const fallbackReason = comparableEvidence
          ? null
          : ranked.find((entry) => entry.evidence.fallbackReason !== null)?.evidence.fallbackReason ?? 'INCOMPLETE_COMPARABLE_EVIDENCE'
        return {
          source: 'GOVERNED_REGISTRY', reason: 'ACTIVE_GOVERNED_CANDIDATE_SELECTED', provider,
          evidence: {
            aiSystemId: candidate.entry.aiSystemId,
            aiSystemVersionId: candidate.entry.aiSystemVersionId,
            systemKey: candidate.entry.systemKey,
            provider: providerId,
            modelName,
            evaluationType: enforcedPolicy?.evaluationType ?? null,
            evaluationMetricName: enforcedPolicy?.evaluationMetricName ?? null,
            evaluationAverageScore: comparableEvidence ? candidate.evidence.averageScore : null,
            evaluationScoredCount: comparableEvidence ? candidate.evidence.scoredCount : 0,
            evaluationPassRate: comparableEvidence ? candidate.evidence.passRate : null,
            evaluationEvidenceResultIds: comparableEvidence ? candidate.evidence.evidenceResultIds : [],
            evaluationLastObservedAt: comparableEvidence ? candidate.evidence.lastObservedAt : null,
            evaluationMode: comparableEvidence ? 'CANONICAL_EVALUATION' : 'DETERMINISTIC_FALLBACK',
            evaluationFallbackReason: fallbackReason,
            routingPolicyId: policy?.id ?? null,
            routingPolicyReason: candidate.policyReason,
          },
        }
      } catch {}
    }
    return { source: 'UNAVAILABLE', reason: 'GOVERNED_CANDIDATES_NOT_EXECUTABLE', provider: null, evidence: null }
  }
}