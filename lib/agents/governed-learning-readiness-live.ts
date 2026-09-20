import { authorizeProject } from '@/lib/auth/authorize'
import { GOVERNED_AGENT_KEYS } from '@/lib/agents/governed-agent-registry'
import { PGCL_AGENT_DEFAULT_SKILL } from '@/lib/agents/proactive-governed-case-learning'
import { createAdminClient } from '@/lib/supabase/admin'

export type GovernedLearningLiveReadinessEvidence = {
  requiredTablesPresent: boolean
  requiredRlsEnabled: boolean
  allEightAgentsCovered: boolean
  activeDataGovernanceAdminBindingCount: number
  successfulGovernedRunCount: number
  canonicallyVerifiedRunCount: number
  positiveCaseCount: number
  approvedPositiveCaseCount: number
  productionEligibleApprovedPositiveCaseCount: number
  appliedPositiveCaseUsageCount: number
  successfulPositiveCaseUsageCount: number
  productionEligibleSuccessfulPositiveCaseUsageCount: number
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function bool(value: unknown) {
  return value === true
}

function count(value: unknown, label: string) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid governed learning readiness count: ${label}`)
  }
  return parsed
}

export async function readGovernedLearningLiveReadinessEvidence(input: {
  projectId: string
  actorUserId: string
}): Promise<GovernedLearningLiveReadinessEvidence> {
  await authorizeProject(input.actorUserId, input.projectId, 'admin.manage')

  const allEightAgentsCovered = GOVERNED_AGENT_KEYS.length === 8
    && GOVERNED_AGENT_KEYS.every((agentKey) => Boolean(PGCL_AGENT_DEFAULT_SKILL[agentKey]))

  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc(
    'get_governed_learning_readiness_evidence',
    { p_project_id: input.projectId },
  )

  if (error || !data) {
    throw new Error(
      `Unable to read governed learning production readiness evidence: ${error?.message ?? 'no evidence returned'}`,
    )
  }

  const evidence = record(data)
  return {
    requiredTablesPresent: bool(evidence.requiredTablesPresent),
    requiredRlsEnabled: bool(evidence.requiredRlsEnabled),
    allEightAgentsCovered,
    activeDataGovernanceAdminBindingCount: count(
      evidence.activeDataGovernanceAdminBindingCount,
      'activeDataGovernanceAdminBindingCount',
    ),
    successfulGovernedRunCount: count(
      evidence.successfulGovernedRunCount,
      'successfulGovernedRunCount',
    ),
    canonicallyVerifiedRunCount: count(
      evidence.canonicallyVerifiedRunCount,
      'canonicallyVerifiedRunCount',
    ),
    positiveCaseCount: count(evidence.positiveCaseCount, 'positiveCaseCount'),
    approvedPositiveCaseCount: count(
      evidence.approvedPositiveCaseCount,
      'approvedPositiveCaseCount',
    ),
    productionEligibleApprovedPositiveCaseCount: count(
      evidence.productionEligibleApprovedPositiveCaseCount,
      'productionEligibleApprovedPositiveCaseCount',
    ),
    appliedPositiveCaseUsageCount: count(
      evidence.appliedPositiveCaseUsageCount,
      'appliedPositiveCaseUsageCount',
    ),
    successfulPositiveCaseUsageCount: count(
      evidence.successfulPositiveCaseUsageCount,
      'successfulPositiveCaseUsageCount',
    ),
    productionEligibleSuccessfulPositiveCaseUsageCount: count(
      evidence.productionEligibleSuccessfulPositiveCaseUsageCount,
      'productionEligibleSuccessfulPositiveCaseUsageCount',
    ),
  }
}
