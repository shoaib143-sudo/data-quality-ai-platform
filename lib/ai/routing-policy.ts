import type { ModelRisk, ModelSensitivity } from './model-gateway'
import type { ReasoningTask } from './reasoning-provider'
import type { RegisteredModelVersion } from './model-registry'

export type RoutingPolicyContext = {
  projectId: string
  task: ReasoningTask
  sensitivity?: ModelSensitivity
  risk?: ModelRisk
}

export type RoutingPolicy = {
  id: string
  task: ReasoningTask
  sensitivity: ModelSensitivity | 'ANY'
  risk: ModelRisk | 'ANY'
  enabled: boolean
  allowedAiSystemIds: string[]
  minEvaluationScore: number | null
  minScoredCount: number
  allowEnvironmentFallback: boolean
}

export interface RoutingPolicyProvider {
  readonly id: string
  resolve(context: RoutingPolicyContext): Promise<RoutingPolicy | null>
}

export type RoutingPolicyEvaluation = {
  allowed: boolean
  reason:
    | 'NO_ACTIVE_POLICY'
    | 'POLICY_DISABLED'
    | 'AI_SYSTEM_NOT_ALLOWED'
    | 'INSUFFICIENT_EVALUATION_SCORE'
    | 'INSUFFICIENT_EVALUATION_EVIDENCE'
    | 'POLICY_ALLOWED'
}

export function evaluateModelAgainstRoutingPolicy(
  model: RegisteredModelVersion,
  policy: RoutingPolicy | null,
  evidence: { averageScore: number | null; scoredCount: number },
): RoutingPolicyEvaluation {
  if (!policy) return { allowed: true, reason: 'NO_ACTIVE_POLICY' }
  if (!policy.enabled) return { allowed: true, reason: 'POLICY_DISABLED' }

  if (policy.allowedAiSystemIds.length > 0 && !policy.allowedAiSystemIds.includes(model.aiSystemId)) {
    return { allowed: false, reason: 'AI_SYSTEM_NOT_ALLOWED' }
  }
  if (evidence.scoredCount < policy.minScoredCount) {
    return { allowed: false, reason: 'INSUFFICIENT_EVALUATION_EVIDENCE' }
  }
  if (policy.minEvaluationScore !== null && (evidence.averageScore === null || evidence.averageScore < policy.minEvaluationScore)) {
    return { allowed: false, reason: 'INSUFFICIENT_EVALUATION_SCORE' }
  }
  return { allowed: true, reason: 'POLICY_ALLOWED' }
}
