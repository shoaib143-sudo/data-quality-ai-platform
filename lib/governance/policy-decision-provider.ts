export type PolicyRiskLevel = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
export type PolicyDecision = 'ALLOW' | 'REQUIRE_APPROVAL' | 'DENY'

export type PolicyDecisionRequest = {
  projectId: string
  actionKey: string
  targetType: string
  riskLevel: PolicyRiskLevel
  confidence: number
}

export type PolicyDecisionResult = {
  decision: PolicyDecision
  reason: string
  providerId: string
  policyId: string | null
  policyVersionId: string | null
  authorityStatus: string | null
  executionMode: 'AUTO' | 'APPROVAL_REQUIRED' | 'BLOCKED' | null
  reversible: boolean
}

export type PolicyDecisionPolicyRecord = {
  id: string
  project_id: string
  action_key: string
  enabled: boolean
  execution_mode: 'AUTO' | 'APPROVAL_REQUIRED' | 'BLOCKED'
  min_confidence: number | string
  max_auto_risk_level: PolicyRiskLevel
  reversible: boolean
  allowed_target_types: string[] | null
  authority_status: string
  current_version_id: string | null
}

export type PolicyDecisionVersionRecord = {
  id: string
  project_id: string
  policy_id: string
  version_number: number
  semantic_hash: string
  provenance: string
}

export interface PolicyDecisionPersistence {
  findPolicy(projectId: string, actionKey: string): Promise<PolicyDecisionPolicyRecord | null>
  findPolicyVersion(projectId: string, policyId: string, versionId: string): Promise<PolicyDecisionVersionRecord | null>
}

export interface PolicyDecisionProvider {
  readonly id: string
  decide(request: PolicyDecisionRequest): Promise<PolicyDecisionResult>
}

const RISK_RANK: Record<PolicyRiskLevel, number> = {
  INFO: 0,
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
  CRITICAL: 4,
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function normalizedConfidence(value: number) {
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('confidence must be between 0 and 1')
  return value
}

function deny(providerId: string, reason: string, policy?: PolicyDecisionPolicyRecord | null): PolicyDecisionResult {
  return {
    decision: 'DENY',
    reason,
    providerId,
    policyId: policy?.id ?? null,
    policyVersionId: policy?.current_version_id ?? null,
    authorityStatus: policy?.authority_status ?? null,
    executionMode: policy?.execution_mode ?? null,
    reversible: policy?.reversible ?? false,
  }
}

export class GovernedPolicyDecisionProvider implements PolicyDecisionProvider {
  readonly id = 'governance_autonomy_policy'

  constructor(private readonly persistence: PolicyDecisionPersistence) {}

  async decide(request: PolicyDecisionRequest): Promise<PolicyDecisionResult> {
    const projectId = requiredText(request.projectId, 'projectId')
    const actionKey = requiredText(request.actionKey, 'actionKey').toUpperCase()
    const targetType = requiredText(request.targetType, 'targetType').toUpperCase()
    const confidence = normalizedConfidence(request.confidence)

    const policy = await this.persistence.findPolicy(projectId, actionKey)
    if (!policy) return deny(this.id, `No governed policy is registered for ${actionKey}.`)
    if (policy.project_id !== projectId || policy.action_key.toUpperCase() !== actionKey) {
      return deny(this.id, 'Resolved policy does not match the requested project and action.', policy)
    }
    if (!policy.current_version_id) {
      return deny(this.id, 'Policy has no canonical current version.', policy)
    }

    const version = await this.persistence.findPolicyVersion(projectId, policy.id, policy.current_version_id)
    if (!version || version.id !== policy.current_version_id || version.policy_id !== policy.id || version.project_id !== projectId) {
      return deny(this.id, 'Canonical current policy version could not be verified.', policy)
    }

    if (!policy.enabled || policy.execution_mode === 'BLOCKED') {
      return deny(this.id, `Action ${actionKey} is blocked by governed policy.`, policy)
    }

    const allowedTargets = (policy.allowed_target_types ?? []).map((value) => value.trim().toUpperCase()).filter(Boolean)
    if (allowedTargets.length > 0 && !allowedTargets.includes(targetType)) {
      return deny(this.id, `Target type ${targetType} is not allowlisted for ${actionKey}.`, policy)
    }

    const base = {
      providerId: this.id,
      policyId: policy.id,
      policyVersionId: version.id,
      authorityStatus: policy.authority_status,
      executionMode: policy.execution_mode,
      reversible: policy.reversible,
    }

    if (policy.execution_mode === 'APPROVAL_REQUIRED') {
      return { decision: 'REQUIRE_APPROVAL', reason: 'Governed policy requires explicit approval.', ...base }
    }

    if (confidence < Number(policy.min_confidence)) {
      return { decision: 'REQUIRE_APPROVAL', reason: 'Confidence is below the governed automatic-execution threshold.', ...base }
    }
    if (RISK_RANK[request.riskLevel] > RISK_RANK[policy.max_auto_risk_level]) {
      return { decision: 'REQUIRE_APPROVAL', reason: 'Risk exceeds the governed automatic-execution threshold.', ...base }
    }
    if (!policy.reversible) {
      return { decision: 'REQUIRE_APPROVAL', reason: 'Automatic execution requires an explicitly reversible governed policy.', ...base }
    }

    return { decision: 'ALLOW', reason: 'Governed policy permits reversible automatic execution.', ...base }
  }
}
