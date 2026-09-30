import { GOVERNED_AGENT_KEYS, type GovernedAgentKey } from './governed-agent-registry'
import { getGovernedSkill, type GovernedSkillKey } from './governed-skill-registry'

/** Pure evaluation contract. Callers must resolve authorization and immutable
 * evidence from trusted persistence; this module never grants execution authority. */
export type LearningEvaluationPolicy = {
  policyId: string
  projectId: string
  candidateId: string
  agentKey: GovernedAgentKey
  skillKey: GovernedSkillKey
  mode: 'GUIDED' | 'GOVERNED_AUTO' | 'FULL_AUTONOMOUS'
  datasetVersionIds: string[]
  baselineVersion: string
  candidateVersion: string
  rollbackRef: string
  evaluatorActorId: string
  proposerActorId: string
  rubricRef: string
  calibrationRef: string
  manifestHash: string
  lockedAt: string
  primaryMetric: string
  analysisPlanRef: string
  sampleSize: number
  minimumGain: number
  minimumScore: number
  budget: { totalCost: number; perRunCost: number; totalTokens: number; perRunTokens: number; latencyMs: number }
}

function text(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim()) throw new Error(`${label} must be normalized non-empty text`)
}
function number(value: unknown, label: string, minimum: number, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || (integer && !Number.isSafeInteger(value))) throw new Error(`${label} is invalid`)
}

export function validateLearningEvaluationPolicy(policy: LearningEvaluationPolicy): void {
  if (!policy || typeof policy !== 'object') throw new Error('policy is required')
  for (const key of ['policyId', 'projectId', 'candidateId', 'agentKey', 'skillKey', 'baselineVersion', 'candidateVersion', 'rollbackRef', 'evaluatorActorId', 'proposerActorId', 'rubricRef', 'calibrationRef', 'manifestHash', 'lockedAt', 'primaryMetric', 'analysisPlanRef'] as const) text(policy[key], key)
  if (!['GUIDED', 'GOVERNED_AUTO', 'FULL_AUTONOMOUS'].includes(policy.mode)) throw new Error('unsupported evaluation mode')
  if (!GOVERNED_AGENT_KEYS.includes(policy.agentKey)) throw new Error('unsupported governed agent')
  if (!getGovernedSkill(policy.skillKey).eligibleAgents.includes(policy.agentKey)) throw new Error('skill is outside agent scope')
  if (policy.baselineVersion === policy.candidateVersion) throw new Error('candidate must differ from baseline')
  if (policy.evaluatorActorId === policy.proposerActorId) throw new Error('evaluator must differ from proposer')
  if (!/^sha256:[a-f0-9]{64}$/.test(policy.manifestHash)) throw new Error('manifestHash must be SHA-256')
  if (!Number.isFinite(Date.parse(policy.lockedAt))) throw new Error('lockedAt is invalid')
  if (!Array.isArray(policy.datasetVersionIds) || !policy.datasetVersionIds.length) throw new Error('dataset versions are required')
  policy.datasetVersionIds.forEach(value => text(value, 'datasetVersionId'))
  if (new Set(policy.datasetVersionIds).size !== policy.datasetVersionIds.length) throw new Error('duplicate dataset version')
  number(policy.sampleSize, 'sampleSize', 1, true)
  number(policy.minimumGain, 'minimumGain', 0)
  if (policy.minimumGain <= 0 || policy.minimumGain > 1) throw new Error('minimumGain must be strictly positive and bounded')
  number(policy.minimumScore, 'minimumScore', 0)
  if (policy.minimumScore > 1) throw new Error('minimumScore must be bounded')
  if (!policy.budget) throw new Error('budget is required')
  for (const key of ['totalCost', 'perRunCost'] as const) number(policy.budget[key], key, 0)
  for (const key of ['totalTokens', 'perRunTokens'] as const) number(policy.budget[key], key, 0, true)
  number(policy.budget.latencyMs, 'latencyMs', 1, true)
  if (policy.budget.perRunCost > policy.budget.totalCost || policy.budget.perRunTokens > policy.budget.totalTokens) throw new Error('per-run budget exceeds total budget')
}

export type LearningEvaluationResult = {
  policyId: string
  projectId: string
  candidateId: string
  baselineVersion: string
  candidateVersion: string
  mode: string
  manifestHash: string
  evaluatorActorId: string
  observedAt: string
  sampleCount: number
  baselineScore: number | null
  candidateScore: number | null
  /** Computed by the locked analysis plan, not estimated by this validator. */
  gainLowerConfidenceBound: number | null
  independentlyVerified: boolean
  evidenceComplete: boolean
  confirmationWindowPassed: boolean
  authorityViolations: number
  safetyFailures: number
  accountingComplete: boolean
  totalCost: number
  maxRunCost: number
  totalTokens: number
  maxRunTokens: number
  maxLatencyMs: number
}

export type LearningEvaluationDecision = {
  disposition: 'STOPPED' | 'REJECTED' | 'REVIEW_REQUIRED'
  quality: 'IMPROVED' | 'REGRESSED' | 'INCONCLUSIVE'
  reasons: string[]
  automaticPromotionAllowed: false
}

export function classifyLearningEvaluation(policy: LearningEvaluationPolicy, result: LearningEvaluationResult): LearningEvaluationDecision {
  validateLearningEvaluationPolicy(policy)
  const answer = (disposition: 'STOPPED' | 'REJECTED' | 'REVIEW_REQUIRED', quality: 'IMPROVED' | 'REGRESSED' | 'INCONCLUSIVE', ...reasons: string[]) => ({ disposition, quality, reasons, automaticPromotionAllowed: false as const })
  for (const key of ['authorityViolations', 'safetyFailures'] as const) number(result[key], key, 0, true)
  // Safety rejection cannot be hidden by a missing quality score or mismatched context.
  if (result.authorityViolations || result.safetyFailures) return answer('REJECTED', 'INCONCLUSIVE', 'PROHIBITED_VIOLATION')
  for (const key of ['policyId', 'projectId', 'candidateId', 'baselineVersion', 'candidateVersion', 'mode', 'manifestHash', 'evaluatorActorId'] as const) {
    if (result[key] !== policy[key]) return answer('STOPPED', 'INCONCLUSIVE', 'EVIDENCE_BINDING_MISMATCH')
  }
  if (!Number.isFinite(Date.parse(result.observedAt)) || Date.parse(result.observedAt) < Date.parse(policy.lockedAt)) return answer('STOPPED', 'INCONCLUSIVE', 'EVIDENCE_PREDATES_POLICY')
  if (result.accountingComplete !== true) return answer('STOPPED', 'INCONCLUSIVE', 'MISSING_ACCOUNTING')
  for (const key of ['totalCost', 'maxRunCost', 'maxLatencyMs'] as const) number(result[key], key, 0)
  for (const key of ['sampleCount', 'totalTokens', 'maxRunTokens'] as const) number(result[key], key, 0, true)
  if (result.maxRunCost > result.totalCost || result.maxRunTokens > result.totalTokens) return answer('STOPPED', 'INCONCLUSIVE', 'INCONSISTENT_ACCOUNTING')
  if (result.totalCost > policy.budget.totalCost || result.maxRunCost > policy.budget.perRunCost || result.totalTokens > policy.budget.totalTokens || result.maxRunTokens > policy.budget.perRunTokens || result.maxLatencyMs > policy.budget.latencyMs) return answer('STOPPED', 'INCONCLUSIVE', 'BUDGET_EXCEEDED')
  if (result.independentlyVerified !== true || result.evidenceComplete !== true || result.sampleCount < policy.sampleSize) return answer('REVIEW_REQUIRED', 'INCONCLUSIVE', 'INSUFFICIENT_VERIFIED_EVIDENCE')
  for (const key of ['baselineScore', 'candidateScore'] as const) {
    if (result[key] === null) return answer('REVIEW_REQUIRED', 'INCONCLUSIVE', 'MISSING_QUALITY_SCORE')
    number(result[key], key, 0)
    if (result[key]! > 1) throw new Error(`${key} must be bounded`)
  }
  const gain = result.candidateScore! - result.baselineScore!
  if (gain < 0) return answer('REVIEW_REQUIRED', 'REGRESSED', 'QUALITY_REGRESSION')
  if (result.gainLowerConfidenceBound === null) return answer('REVIEW_REQUIRED', 'INCONCLUSIVE', 'MISSING_UNCERTAINTY')
  number(result.gainLowerConfidenceBound, 'gainLowerConfidenceBound', -1)
  if (result.gainLowerConfidenceBound > gain) throw new Error('confidence lower bound exceeds observed gain')
  if (gain < policy.minimumGain || result.candidateScore! < policy.minimumScore || result.gainLowerConfidenceBound <= 0 || result.confirmationWindowPassed !== true) return answer('REVIEW_REQUIRED', 'INCONCLUSIVE', 'GAIN_NOT_CONFIRMED')
  return answer('REVIEW_REQUIRED', 'IMPROVED', 'POSITIVE_GAIN_REQUIRES_RELEASE_REVIEW')
}


export function assertLearningEvaluationEligibleForReleaseReview(
  policy: LearningEvaluationPolicy,
  result: LearningEvaluationResult,
): LearningEvaluationDecision {
  const decision = classifyLearningEvaluation(policy, result)
  if (
    decision.disposition !== 'REVIEW_REQUIRED'
    || decision.quality !== 'IMPROVED'
    || decision.automaticPromotionAllowed !== false
  ) {
    throw new Error(`Learning evaluation is not eligible for release review: ${decision.reasons.join(',') || 'NO_ELIGIBLE_DECISION'}`)
  }
  return decision
}
