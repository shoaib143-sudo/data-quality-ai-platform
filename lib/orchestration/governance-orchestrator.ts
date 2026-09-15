export type AutonomyMode = 'OFF' | 'GUIDED' | 'GOVERNED_AUTO' | 'FULL_AUTONOMOUS'
export type RiskTier = 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export type CapabilityDescriptor = {
  capabilityKey: string
  domain: string
  version: string
  mandatoryForE2E: boolean
  executorType: 'AGENT' | 'TOOL' | 'WORKFLOW' | 'MODEL' | 'RETRIEVAL' | 'CERTIFIER'
  executorKey: string
  requiredCapability: string | null
  riskTier: RiskTier
  dependencies: string[]
  evidenceContract: string[]
  certificationGate: string | null
  enabled: boolean
}

export type AutonomyPolicy = {
  mode: AutonomyMode
  enabled: boolean
  policyVersion: string
  maximumRiskTier: RiskTier
  allowedAgentKeys: string[]
  allowedToolKeys: string[]
  allowedModelClasses: string[]
  allowedMutationClasses: string[]
  approvalRequiredActions: string[]
  autoRemediationEnabled: boolean
  autoRollbackEnabled: boolean
  maxExecutionBudget: number
  maxModelBudget: number
  maxRuntimeMs: number
  maxDatasetsChangedPerRun: number
  maxProjectsAffectedPerRun: number
  maxRemediationActionsPerHour: number
  maxConcurrentModelCalls: number
  emergencyStop: boolean
}

export type CanonicalCapabilityResultRow = {
  capability_sr_no: number
  module: string
  capability: string
  execution_state: 'NOT_RUN' | 'EXECUTED' | 'BLOCKED' | 'FAILED'
  verification_state: 'UNKNOWN' | 'VERIFIED' | 'FAILED' | 'INCONCLUSIVE'
  blocker_code: string | null
}

export const CANONICAL_AI_CAPABILITY_COUNT = 75

const riskRank: Record<RiskTier, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }

export function evaluateAutonomyPolicy(policy: AutonomyPolicy, input: {
  riskTier: RiskTier
  actionKey: string
  agentKey?: string
  toolKey?: string
  modelClass?: string
  mutationClass?: string
  estimatedExecutionCost?: number
  estimatedModelCost?: number
}) {
  if (!policy.enabled || policy.mode === 'OFF') return { allowed: false, requiresApproval: false, reason: 'Autonomy is disabled.' }
  if (policy.emergencyStop) return { allowed: false, requiresApproval: false, reason: 'Emergency stop is active.' }
  if (riskRank[input.riskTier] > riskRank[policy.maximumRiskTier]) return { allowed: false, requiresApproval: false, reason: 'Risk tier exceeds policy maximum.' }
  if ((input.estimatedExecutionCost ?? 0) > policy.maxExecutionBudget) return { allowed: false, requiresApproval: false, reason: 'Execution budget exceeded.' }
  if ((input.estimatedModelCost ?? 0) > policy.maxModelBudget) return { allowed: false, requiresApproval: false, reason: 'Model budget exceeded.' }
  if (input.agentKey && !policy.allowedAgentKeys.includes(input.agentKey)) return { allowed: false, requiresApproval: false, reason: 'Agent is not permitted.' }
  if (input.toolKey && !policy.allowedToolKeys.includes(input.toolKey)) return { allowed: false, requiresApproval: false, reason: 'Tool is not permitted.' }
  if (input.modelClass && !policy.allowedModelClasses.includes(input.modelClass)) return { allowed: false, requiresApproval: false, reason: 'Model class is not permitted.' }
  if (input.mutationClass && !policy.allowedMutationClasses.includes(input.mutationClass)) return { allowed: false, requiresApproval: false, reason: 'Mutation class is not permitted.' }
  const requiresApproval = policy.mode === 'GUIDED' || policy.approvalRequiredActions.includes(input.actionKey)
  return { allowed: true, requiresApproval, reason: requiresApproval ? 'Action is permitted but requires approval.' : 'Action is permitted by active autonomy policy.' }
}

export function validateBlastRadius(policy: AutonomyPolicy, input: { datasetsChanged: number; projectsAffected: number; remediationActionsThisHour: number }) {
  const failures: string[] = []
  if (input.datasetsChanged > policy.maxDatasetsChangedPerRun) failures.push('Dataset blast-radius limit exceeded.')
  if (input.projectsAffected > policy.maxProjectsAffectedPerRun) failures.push('Project blast-radius limit exceeded.')
  if (input.remediationActionsThisHour > policy.maxRemediationActionsPerHour) failures.push('Remediation rate limit exceeded.')
  return failures
}

export function validateCapabilityPlan(descriptors: CapabilityDescriptor[]) {
  const failures: string[] = []
  const keys = new Set(descriptors.map(row => row.capabilityKey))
  if (keys.size !== descriptors.length) failures.push('Capability keys must be unique.')
  for (const row of descriptors) {
    for (const dependency of row.dependencies) {
      if (!keys.has(dependency)) failures.push(`${row.capabilityKey}: unknown dependency ${dependency}.`)
      if (dependency === row.capabilityKey) failures.push(`${row.capabilityKey}: capability cannot depend on itself.`)
    }
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const byKey = new Map(descriptors.map(row => [row.capabilityKey, row]))
  const visit = (key: string) => {
    if (visited.has(key)) return
    if (visiting.has(key)) { failures.push(`Capability dependency cycle detected at ${key}.`); return }
    visiting.add(key)
    for (const dep of byKey.get(key)?.dependencies ?? []) visit(dep)
    visiting.delete(key)
    visited.add(key)
  }
  for (const key of keys) visit(key)
  return [...new Set(failures)]
}

export function summarizeCanonicalCapabilityLedger(rows: CanonicalCapabilityResultRow[]) {
  const unique = new Set(rows.map(row => row.capability_sr_no))
  const accounted = unique.size
  const duplicateRows = rows.length - accounted
  const outOfRangeRows = rows.filter(row => !Number.isInteger(row.capability_sr_no) || row.capability_sr_no < 1 || row.capability_sr_no > CANONICAL_AI_CAPABILITY_COUNT).length
  const executed = rows.filter(row => row.execution_state === 'EXECUTED').length
  const blocked = rows.filter(row => row.execution_state === 'BLOCKED').length
  const failed = rows.filter(row => row.execution_state === 'FAILED').length
  const verified = rows.filter(row => row.verification_state === 'VERIFIED').length
  const verificationFailed = rows.filter(row => row.verification_state === 'FAILED').length
  const inconclusive = rows.filter(row => row.verification_state === 'INCONCLUSIVE').length
  const unaccounted = Math.max(0, CANONICAL_AI_CAPABILITY_COUNT - accounted)
  return {
    mandatory: CANONICAL_AI_CAPABILITY_COUNT,
    accounted,
    executed,
    verified,
    blocked,
    failed,
    verificationFailed,
    inconclusive,
    unaccounted,
    duplicateRows,
    outOfRangeRows,
    accountingCoveragePct: accounted / CANONICAL_AI_CAPABILITY_COUNT * 100,
    executionCoveragePct: executed / CANONICAL_AI_CAPABILITY_COUNT * 100,
    certificationCoveragePct: verified / CANONICAL_AI_CAPABILITY_COUNT * 100,
    certificationEligible:
      rows.length === CANONICAL_AI_CAPABILITY_COUNT &&
      accounted === CANONICAL_AI_CAPABILITY_COUNT &&
      duplicateRows === 0 &&
      outOfRangeRows === 0 &&
      executed === CANONICAL_AI_CAPABILITY_COUNT &&
      verified === CANONICAL_AI_CAPABILITY_COUNT &&
      blocked === 0 &&
      failed === 0 &&
      verificationFailed === 0 &&
      inconclusive === 0,
  }
}
