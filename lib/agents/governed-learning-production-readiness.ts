export const GOVERNED_LEARNING_PRODUCTION_READINESS_VERSION = '1.0' as const

export type GovernedLearningProductionReadinessInput = {
  requiredTablesPresent: boolean
  requiredRlsEnabled: boolean
  allEightAgentsCovered: boolean
  activeDataGovernanceAdminBindingCount: number
  successfulGovernedRunCount: number
  canonicallyVerifiedRunCount: number
  positiveCaseCount: number
  approvedPositiveCaseCount: number
  appliedPositiveCaseUsageCount: number
  successfulPositiveCaseUsageCount: number
}

export type GovernedLearningProductionReadinessStatus =
  | 'BLOCKED'
  | 'READY_FOR_PROOF'
  | 'EVIDENCE_IN_PROGRESS'
  | 'CERTIFIED'

export type GovernedLearningProductionReadiness = {
  version: typeof GOVERNED_LEARNING_PRODUCTION_READINESS_VERSION
  status: GovernedLearningProductionReadinessStatus
  blockers: string[]
  evidence: GovernedLearningProductionReadinessInput
  controls: {
    syntheticEvidenceMayCertify: false
    selfPromotionAllowed: false
    authorizationBypassAllowed: false
    humanReviewRequired: true
    successfulReuseRequiredForCertification: true
  }
}

function nonNegativeInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`)
  return value
}

export function evaluateGovernedLearningProductionReadiness(
  input: GovernedLearningProductionReadinessInput,
): GovernedLearningProductionReadiness {
  const evidence: GovernedLearningProductionReadinessInput = {
    requiredTablesPresent: input.requiredTablesPresent === true,
    requiredRlsEnabled: input.requiredRlsEnabled === true,
    allEightAgentsCovered: input.allEightAgentsCovered === true,
    activeDataGovernanceAdminBindingCount: nonNegativeInteger(
      input.activeDataGovernanceAdminBindingCount,
      'activeDataGovernanceAdminBindingCount',
    ),
    successfulGovernedRunCount: nonNegativeInteger(input.successfulGovernedRunCount, 'successfulGovernedRunCount'),
    canonicallyVerifiedRunCount: nonNegativeInteger(input.canonicallyVerifiedRunCount, 'canonicallyVerifiedRunCount'),
    positiveCaseCount: nonNegativeInteger(input.positiveCaseCount, 'positiveCaseCount'),
    approvedPositiveCaseCount: nonNegativeInteger(input.approvedPositiveCaseCount, 'approvedPositiveCaseCount'),
    appliedPositiveCaseUsageCount: nonNegativeInteger(
      input.appliedPositiveCaseUsageCount,
      'appliedPositiveCaseUsageCount',
    ),
    successfulPositiveCaseUsageCount: nonNegativeInteger(
      input.successfulPositiveCaseUsageCount,
      'successfulPositiveCaseUsageCount',
    ),
  }

  const blockers: string[] = []
  if (!evidence.requiredTablesPresent) blockers.push('REQUIRED_PHASE11_TABLES_MISSING')
  if (!evidence.requiredRlsEnabled) blockers.push('REQUIRED_PHASE11_RLS_MISSING')
  if (!evidence.allEightAgentsCovered) blockers.push('ALL_EIGHT_AGENT_PGCL_COVERAGE_MISSING')
  if (evidence.activeDataGovernanceAdminBindingCount === 0) blockers.push('NO_ACTIVE_DATA_GOVERNANCE_ADMIN_BINDING')
  if (evidence.successfulGovernedRunCount === 0) blockers.push('NO_SUCCESSFUL_GOVERNED_RUN')
  if (evidence.canonicallyVerifiedRunCount === 0) blockers.push('NO_CANONICALLY_VERIFIED_GOVERNED_RUN')

  let status: GovernedLearningProductionReadinessStatus = 'BLOCKED'
  if (blockers.length === 0) {
    status = 'READY_FOR_PROOF'
    if (evidence.positiveCaseCount > 0) status = 'EVIDENCE_IN_PROGRESS'
    if (
      evidence.approvedPositiveCaseCount > 0
      && evidence.successfulPositiveCaseUsageCount > 0
    ) {
      status = 'CERTIFIED'
    }
  }

  return {
    version: GOVERNED_LEARNING_PRODUCTION_READINESS_VERSION,
    status,
    blockers,
    evidence,
    controls: {
      syntheticEvidenceMayCertify: false,
      selfPromotionAllowed: false,
      authorizationBypassAllowed: false,
      humanReviewRequired: true,
      successfulReuseRequiredForCertification: true,
    },
  }
}
