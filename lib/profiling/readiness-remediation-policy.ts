export type ReadinessRemediationPolicy = {
  blockerCodes: string[]
  sourceId: string | null
  approvalRequired: boolean
  allLowRisk: boolean
  allAddressableBySourceRevalidation: boolean
  canExecuteLowRiskRepair: boolean
  allowedActions: Array<'REVALIDATE_SOURCE' | 'NO_ACTION'>
}

const AUTOMATIC_SOURCE_REPAIR_BLOCKERS = new Set([
  'SOURCE_NOT_OBSERVED_READY',
  'EXECUTION_SOURCE_NOT_BOUND',
])

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function evaluateProfileReadinessRemediationPolicy(readiness: Record<string, unknown>): ReadinessRemediationPolicy {
  const blockers = record(readiness.blockers)
  const remediation = record(readiness.remediation)
  const blockerCodes = Object.entries(blockers).filter(([, active]) => active === true).map(([code]) => code)
  const blockerPolicy = (code: string) => record(remediation[code])
  const sourceId = text(readiness.source_id) || null
  const approvalRequired = blockerCodes.some(code => blockerPolicy(code).approval_required === true)
  const allLowRisk = blockerCodes.length > 0 && blockerCodes.every(code => blockerPolicy(code).ai_remediation === 'LOW_RISK_WHEN_POLICY_AUTHORIZED')
  const allAddressableBySourceRevalidation = blockerCodes.length > 0 && blockerCodes.every(code => AUTOMATIC_SOURCE_REPAIR_BLOCKERS.has(code))
  const canExecuteLowRiskRepair = Boolean(sourceId) && !approvalRequired && allLowRisk && allAddressableBySourceRevalidation

  return {
    blockerCodes,
    sourceId,
    approvalRequired,
    allLowRisk,
    allAddressableBySourceRevalidation,
    canExecuteLowRiskRepair,
    allowedActions: canExecuteLowRiskRepair ? ['REVALIDATE_SOURCE', 'NO_ACTION'] : ['NO_ACTION'],
  }
}
