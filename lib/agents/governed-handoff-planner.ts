import {
  getAgentExcellenceContract,
} from './agent-excellence-contracts'
import {
  getGovernedAgentPolicy,
  type GovernedAgentKey,
} from './governed-agent-registry'

export type GovernedHandoffRecommendation = {
  sourceAgentKey: GovernedAgentKey
  targetAgentKey: GovernedAgentKey
  rank: number
  score: number
  matchedEvidenceDomains: string[]
  matchedObjectiveSignals: string[]
  reason: string
  requiresFreshAuthorization: true
  autoExecute: false
}

export type GovernedHandoffPlan = {
  plannerVersion: '1.0'
  sourceAgentKey: GovernedAgentKey
  recommendations: GovernedHandoffRecommendation[]
  remainingHandoffBudget: number
  unresolvedReason: null | 'NO_HANDOFF_BUDGET' | 'NO_ALLOWED_TARGET_MATCH'
}

const TARGET_SIGNALS: Record<GovernedAgentKey, readonly string[]> = {
  profiling_agent: ['profile', 'schema', 'metric', 'distribution'],
  data_quality_agent: ['quality', 'rule', 'control', 'violation', 'remediation'],
  steward_agent: ['steward', 'owner', 'ownership', 'glossary', 'classification', 'certification', 'cde'],
  governance_analyst_agent: ['governance', 'policy', 'regulation', 'risk', 'contract', 'control'],
  architect_agent: ['architecture', 'lineage', 'schema', 'transformation', 'dependency', 'contract'],
  investigator_agent: ['incident', 'anomaly', 'root cause', 'diagnose', 'failure'],
  executive_agent: ['executive', 'portfolio', 'materiality', 'priority', 'scorecard', 'risk'],
  support_agent: ['support', 'troubleshoot', 'operational', 'run failure', 'case'],
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

function unique(values: readonly string[]) {
  return [...new Set(values.map(normalize).filter(Boolean))]
}

export function planGovernedHandoffs(input: {
  sourceAgentKey: GovernedAgentKey
  objective: string
  unresolvedEvidenceDomains?: readonly string[]
  handoffsAlreadyUsed?: number
  maxRecommendations?: number
}): GovernedHandoffPlan {
  const sourcePolicy = getGovernedAgentPolicy(input.sourceAgentKey)
  const excellence = getAgentExcellenceContract(input.sourceAgentKey)
  const used = Math.max(0, Math.trunc(input.handoffsAlreadyUsed ?? 0))
  const remainingHandoffBudget = Math.max(0, excellence.recursionBudget.maxHandoffs - used)

  if (remainingHandoffBudget === 0) {
    return {
      plannerVersion: '1.0',
      sourceAgentKey: input.sourceAgentKey,
      recommendations: [],
      remainingHandoffBudget,
      unresolvedReason: 'NO_HANDOFF_BUDGET',
    }
  }

  const objective = normalize(input.objective)
  const unresolvedDomains = unique(input.unresolvedEvidenceDomains ?? [])
  const recommendations: GovernedHandoffRecommendation[] = []

  for (const targetAgentKey of sourcePolicy.handoffTargets) {
    const targetPolicy = getGovernedAgentPolicy(targetAgentKey)
    const targetDomains = unique(targetPolicy.evidenceDomains)
    const matchedEvidenceDomains = unresolvedDomains.filter((domain) =>
      targetDomains.some((targetDomain) => targetDomain === domain || targetDomain.includes(domain) || domain.includes(targetDomain)),
    )
    const matchedObjectiveSignals = TARGET_SIGNALS[targetAgentKey].filter((signal) => objective.includes(signal))
    if (matchedEvidenceDomains.length === 0 && matchedObjectiveSignals.length === 0) continue

    const score = matchedEvidenceDomains.length * 10 + matchedObjectiveSignals.length * 3
    recommendations.push({
      sourceAgentKey: input.sourceAgentKey,
      targetAgentKey,
      rank: 0,
      score,
      matchedEvidenceDomains,
      matchedObjectiveSignals,
      reason: matchedEvidenceDomains.length
        ? `${targetAgentKey} is an allowed handoff target with governed evidence domains matching unresolved evidence: ${matchedEvidenceDomains.join(', ')}.`
        : `${targetAgentKey} is an allowed handoff target whose specialist objective signals match: ${matchedObjectiveSignals.join(', ')}.`,
      requiresFreshAuthorization: true,
      autoExecute: false,
    })
  }

  recommendations.sort((left, right) => right.score - left.score || left.targetAgentKey.localeCompare(right.targetAgentKey))
  const maxRecommendations = Math.min(
    remainingHandoffBudget,
    Math.max(1, Math.min(5, Math.trunc(input.maxRecommendations ?? remainingHandoffBudget))),
  )
  const selected = recommendations.slice(0, maxRecommendations).map((recommendation, index) => ({
    ...recommendation,
    rank: index + 1,
  }))

  return {
    plannerVersion: '1.0',
    sourceAgentKey: input.sourceAgentKey,
    recommendations: selected,
    remainingHandoffBudget,
    unresolvedReason: selected.length ? null : 'NO_ALLOWED_TARGET_MATCH',
  }
}
