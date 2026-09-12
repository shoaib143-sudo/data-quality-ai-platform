export type RecoveryScopeState = 'PASS' | 'FAIL' | 'NOT_MEASURED' | 'UNAVAILABLE'
export type RecoveryReadinessState = 'PASS' | 'FAIL' | 'NOT_MEASURED'

export const REQUIRED_RECOVERY_SCOPES = [
  'DATABASE',
  'STORAGE',
  'IDENTITY_CONFIG',
  'APPLICATION_CONFIG',
  'EDGE_RUNTIME',
  'DEPENDENCIES',
  'SERVICE_VALIDATION',
] as const

export const TARGET_RPO_MINUTES = 60
export const TARGET_RTO_MINUTES = 240
export const MAX_RELEASE_RECOVERY_EVIDENCE_AGE_HOURS = 24

export type RecoveryScope = (typeof REQUIRED_RECOVERY_SCOPES)[number]

export type RecoveryReadinessInput = {
  sourceCommitSha: string
  rehearsalId: string
  observedAt: string
  scopes: Partial<Record<RecoveryScope, { state: RecoveryScopeState; evidenceRef: string }>>
  timing: {
    authoritativeRecoveryPoint: boolean
    serviceReadyTimestamp: boolean
    measuredRpoMinutes: number | null
    measuredRtoMinutes: number | null
  }
}

export type RecoveryReadinessResult = {
  state: RecoveryReadinessState
  blockers: string[]
  sourceCommitSha: string
  rehearsalId: string
  observedAt: string
  policy: {
    targetRpoMinutes: number
    targetRtoMinutes: number
    maxReleaseEvidenceAgeHours: number
  }
}

const SHA40 = /^[0-9a-f]{40}$/i

function isNonNegativeFinite(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value >= 0
}

export function evaluateRecoveryReadiness(input: RecoveryReadinessInput): RecoveryReadinessResult {
  const blockers: string[] = []
  let hardFailure = false
  const now = Date.now()
  const observed = new Date(input.observedAt)

  if (!SHA40.test(input.sourceCommitSha)) blockers.push('SOURCE_COMMIT_INVALID')
  if (!input.rehearsalId.trim()) blockers.push('REHEARSAL_ID_MISSING')
  if (Number.isNaN(observed.getTime())) blockers.push('OBSERVED_AT_INVALID')
  else if (observed.getTime() > now + 5 * 60 * 1000) blockers.push('OBSERVED_AT_IN_FUTURE')
  else if (now - observed.getTime() > MAX_RELEASE_RECOVERY_EVIDENCE_AGE_HOURS * 60 * 60 * 1000) blockers.push('RECOVERY_EVIDENCE_STALE')

  for (const scope of REQUIRED_RECOVERY_SCOPES) {
    const evidence = input.scopes[scope]
    if (!evidence) {
      blockers.push(`SCOPE_${scope}_MISSING`)
      continue
    }
    if (!evidence.evidenceRef.trim()) blockers.push(`SCOPE_${scope}_EVIDENCE_REF_MISSING`)
    if (evidence.state === 'FAIL') {
      hardFailure = true
      blockers.push(`SCOPE_${scope}_FAILED`)
    } else if (evidence.state !== 'PASS') {
      blockers.push(`SCOPE_${scope}_${evidence.state}`)
    }
  }

  const timing = input.timing
  if (!timing.authoritativeRecoveryPoint) blockers.push('AUTHORITATIVE_RECOVERY_POINT_MISSING')
  if (!timing.serviceReadyTimestamp) blockers.push('SERVICE_READY_TIMESTAMP_MISSING')

  if (timing.measuredRpoMinutes === null) blockers.push('RPO_NOT_MEASURED')
  else if (!isNonNegativeFinite(timing.measuredRpoMinutes)) blockers.push('RPO_MEASUREMENT_INVALID')
  else if (timing.measuredRpoMinutes > TARGET_RPO_MINUTES) {
    hardFailure = true
    blockers.push('RPO_TARGET_MISSED')
  }

  if (timing.measuredRtoMinutes === null) blockers.push('RTO_NOT_MEASURED')
  else if (!isNonNegativeFinite(timing.measuredRtoMinutes)) blockers.push('RTO_MEASUREMENT_INVALID')
  else if (timing.measuredRtoMinutes > TARGET_RTO_MINUTES) {
    hardFailure = true
    blockers.push('RTO_TARGET_MISSED')
  }

  return {
    state: blockers.length === 0 ? 'PASS' : hardFailure ? 'FAIL' : 'NOT_MEASURED',
    blockers,
    sourceCommitSha: input.sourceCommitSha,
    rehearsalId: input.rehearsalId,
    observedAt: input.observedAt,
    policy: {
      targetRpoMinutes: TARGET_RPO_MINUTES,
      targetRtoMinutes: TARGET_RTO_MINUTES,
      maxReleaseEvidenceAgeHours: MAX_RELEASE_RECOVERY_EVIDENCE_AGE_HOURS,
    },
  }
}
