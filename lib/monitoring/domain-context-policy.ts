export type MonitoringPresentationMode = 'OUTCOME' | 'GOVERNANCE' | 'OPERATIONS'

const OPERATIONAL_ROLES = new Set([
  'DATA_OWNER',
  'DATA_STEWARD',
  'DATA_GOVERNANCE_ADMIN',
  'DATA_CUSTODIAN',
  'SOURCE_SYSTEM_OWNER',
  'DATA_QUALITY_ANALYST',
])

const GOVERNANCE_ROLES = new Set([
  'DATA_PRODUCT_OWNER',
  'DATA_GOVERNANCE_SPECIALIST',
  'COMPLIANCE_RISK_OFFICER',
  'PRIVACY_SECURITY_OFFICER',
  'METADATA_ANALYST',
])

export function monitoringPresentationMode(roleKeys: string[], organizationRole: string | null = null): MonitoringPresentationMode {
  const normalized = new Set(roleKeys.map((role) => role.trim().toUpperCase()).filter(Boolean))
  const organization = organizationRole?.trim().toUpperCase() ?? ''
  if (organization === 'OWNER' || organization === 'ADMIN') return 'OPERATIONS'
  if ([...normalized].some((role) => OPERATIONAL_ROLES.has(role))) return 'OPERATIONS'
  if ([...normalized].some((role) => GOVERNANCE_ROLES.has(role))) return 'GOVERNANCE'
  return 'OUTCOME'
}

export type WorkloadPool = 'CORE' | 'SEMANTIC' | 'GOVERNANCE'

export function workloadPoolForJobType(jobType: string): WorkloadPool {
  const normalized = jobType.trim().toUpperCase()
  if (normalized === 'SEMANTIC_INDEX') return 'SEMANTIC'
  if (normalized === 'GOVERNANCE_AGENT') return 'GOVERNANCE'
  return 'CORE'
}

export type DependencySnapshot = {
  dependencyType: string
  parentJobId: string
  parentJobType: string | null
  parentStatus: string | null
  satisfied: boolean
}

export type JobEligibilityInput = {
  status: string
  attempts: number
  maxAttempts: number
  availableAt: string
  leaseExpiresAt?: string | null
}

export type JobEligibilityResult = {
  displayState: string
  eligible: boolean
  blockedBy: Array<DependencySnapshot & { reason: string }>
  waitingReason: string | null
  leaseHealth: 'NOT_APPLICABLE' | 'HEALTHY' | 'MISSING' | 'STALE'
}

function dependencyReason(dependency: DependencySnapshot) {
  const name = dependency.parentJobType || `job ${dependency.parentJobId.slice(0, 8)}`
  if (!dependency.parentStatus) return `${name} dependency record has no resolvable parent job.`
  if (dependency.dependencyType.trim().toUpperCase() === 'TERMINAL') return `Waiting for ${name} to reach a terminal state.`
  return `Waiting for ${name} to succeed.`
}

export function deriveJobEligibility(
  job: JobEligibilityInput,
  dependencies: DependencySnapshot[],
  capacity: { runningCount: number; maxConcurrentJobs: number },
  nowMs = Date.now(),
): JobEligibilityResult {
  const status = job.status.trim().toUpperCase()
  let leaseHealth: JobEligibilityResult['leaseHealth'] = 'NOT_APPLICABLE'
  if (status === 'RUNNING') {
    if (!job.leaseExpiresAt) leaseHealth = 'MISSING'
    else leaseHealth = Date.parse(job.leaseExpiresAt) <= nowMs ? 'STALE' : 'HEALTHY'
  }

  if (status !== 'QUEUED') {
    return { displayState: status || 'UNKNOWN', eligible: false, blockedBy: [], waitingReason: null, leaseHealth }
  }

  if (job.attempts >= job.maxAttempts) {
    return {
      displayState: 'BLOCKED',
      eligible: false,
      blockedBy: [],
      waitingReason: 'Attempt limit reached. The durable queue will not claim this job again without governed intervention.',
      leaseHealth,
    }
  }

  const blockedBy = dependencies
    .filter((dependency) => !dependency.satisfied)
    .map((dependency) => ({ ...dependency, reason: dependencyReason(dependency) }))
  if (blockedBy.length) return { displayState: 'BLOCKED', eligible: false, blockedBy, waitingReason: blockedBy[0].reason, leaseHealth }

  const availableAt = Date.parse(job.availableAt)
  if (Number.isFinite(availableAt) && availableAt > nowMs) {
    return {
      displayState: 'WAITING',
      eligible: false,
      blockedBy: [],
      waitingReason: `Durable retry backoff is active until ${job.availableAt}.`,
      leaseHealth,
    }
  }

  if (capacity.runningCount >= capacity.maxConcurrentJobs) {
    return {
      displayState: 'WAITING',
      eligible: false,
      blockedBy: [],
      waitingReason: `Project capacity is saturated at ${capacity.runningCount}/${capacity.maxConcurrentJobs} running jobs.`,
      leaseHealth,
    }
  }

  return { displayState: 'QUEUED', eligible: true, blockedBy: [], waitingReason: null, leaseHealth }
}
