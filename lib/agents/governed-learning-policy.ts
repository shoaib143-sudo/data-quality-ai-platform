export const LEARNING_RISK_CLASSES = [
  'INFORMATIONAL',
  'RECOMMENDATION',
  'GOVERNANCE_DECISION_SUPPORT',
  'GOVERNED_EXECUTION',
  'PRIVILEGED_OR_DESTRUCTIVE',
] as const

export type LearningRiskClass = typeof LEARNING_RISK_CLASSES[number]

export type GovernedLearningPolicy = {
  riskClass: LearningRiskClass
  minimumEvidenceCount: number
  minimumShadowRuns: number
  humanApprovalRequired: boolean
  automaticPromotionAllowed: false
}

const POLICIES: Record<LearningRiskClass, GovernedLearningPolicy> = {
  INFORMATIONAL: { riskClass: 'INFORMATIONAL', minimumEvidenceCount: 3, minimumShadowRuns: 10, humanApprovalRequired: false, automaticPromotionAllowed: false },
  RECOMMENDATION: { riskClass: 'RECOMMENDATION', minimumEvidenceCount: 5, minimumShadowRuns: 20, humanApprovalRequired: true, automaticPromotionAllowed: false },
  GOVERNANCE_DECISION_SUPPORT: { riskClass: 'GOVERNANCE_DECISION_SUPPORT', minimumEvidenceCount: 10, minimumShadowRuns: 30, humanApprovalRequired: true, automaticPromotionAllowed: false },
  GOVERNED_EXECUTION: { riskClass: 'GOVERNED_EXECUTION', minimumEvidenceCount: 20, minimumShadowRuns: 50, humanApprovalRequired: true, automaticPromotionAllowed: false },
  PRIVILEGED_OR_DESTRUCTIVE: { riskClass: 'PRIVILEGED_OR_DESTRUCTIVE', minimumEvidenceCount: Number.MAX_SAFE_INTEGER, minimumShadowRuns: Number.MAX_SAFE_INTEGER, humanApprovalRequired: true, automaticPromotionAllowed: false },
}

export function governedLearningPolicy(riskClass: LearningRiskClass): GovernedLearningPolicy {
  return { ...POLICIES[riskClass] }
}

export function assertGovernedLearningPromotionEligible(input: {
  policy: GovernedLearningPolicy
  evidenceCount: number
  shadowRunCount: number
  authorityViolations: number
  adversarialFailures: number
  humanApproved: boolean
}) {
  if (input.policy.riskClass === 'PRIVILEGED_OR_DESTRUCTIVE') {
    throw new Error('privileged or destructive learning cannot auto-promote')
  }
  if (input.evidenceCount < input.policy.minimumEvidenceCount) throw new Error('insufficient learning evidence')
  if (input.shadowRunCount < input.policy.minimumShadowRuns) throw new Error('insufficient shadow evidence')
  if (input.authorityViolations > 0) throw new Error('authority regression blocks learning promotion')
  if (input.adversarialFailures > 0) throw new Error('adversarial regression blocks learning promotion')
  if (input.policy.humanApprovalRequired && !input.humanApproved) throw new Error('human approval is required')
  return true as const
}
