export const governedIncidentLifecycleStates = [
  'DETECTED',
  'TRIAGED',
  'INVESTIGATING',
  'ROOT_CAUSE_IDENTIFIED',
  'REMEDIATION_PLANNED',
  'REMEDIATION_IN_PROGRESS',
  'VERIFICATION_PENDING',
  'VERIFYING',
  'VERIFIED_RESOLVED',
  'VERIFICATION_FAILED',
  'RESOLUTION_RECORDED',
  'REOPENED',
  'BLOCKED',
] as const

export type GovernedIncidentLifecycleState = (typeof governedIncidentLifecycleStates)[number]

export type IncidentEvidenceAuthority =
  | 'ISSUE'
  | 'PROFILING'
  | 'DATA_QUALITY'
  | 'OBSERVABILITY'
  | 'LINEAGE'
  | 'BUSINESS_CONTEXT'
  | 'CONTROL'
  | 'AUDIT'
  | 'REMEDIATION'

export type IncidentEvidenceRef = {
  authority: IncidentEvidenceAuthority
  sourceTable: string
  sourceId: string
  kind: string
  observedAt?: string | null
  deterministic: boolean
}

export type IncidentRootCauseEvidence = IncidentEvidenceRef & {
  explanation: string
  confidence?: number | null
  advisory?: boolean
}

export type IncidentImpactEvidence = IncidentEvidenceRef & {
  assetType: string
  assetId: string
  assetName?: string | null
  relationship?: string | null
  distance?: number | null
  riskScore?: number | null
  confidence?: number | null
}

export type IncidentRemediationEvidence = IncidentEvidenceRef & {
  status: string
  action?: string | null
  workflowInstanceId?: string | null
}

export type IncidentVerification = {
  required: boolean
  status: string | null
  sourceRunId: string | null
  verificationRunId: string | null
  qualityScoreDelta?: number | null
  highSeverityFindingsDelta?: number | null
  verifiedAt?: string | null
  evidence: IncidentEvidenceRef[]
}

export type GovernedIncidentTruth = {
  incidentId: string
  projectId: string
  datasetId: string | null
  datasetVersionId: string | null
  issueId: string
  severity: string
  issueStatus: string
  ownerUserId: string | null
  lifecycleState: GovernedIncidentLifecycleState
  verificationStatus: string | null
  openedAt: string
  updatedAt: string
  resolvedAt: string | null
}

export type GovernedIncident = {
  truth: GovernedIncidentTruth
  title: string
  description: string | null
  profileRunId: string | null
  findingIds: string[]
  qualityRuleRunId: string | null
  controlFindingId: string | null
  rootCauseEvidence: IncidentRootCauseEvidence[]
  impactEvidence: IncidentImpactEvidence[]
  remediationEvidence: IncidentRemediationEvidence[]
  verification: IncidentVerification
  evidence: IncidentEvidenceRef[]
  truthBoundary: 'GOVERNED_OUTCOME_ONLY'
  authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE'
  evidenceVersion: 1
}

export type IncidentLifecycleSignals = {
  issueStatus: string
  hasRootCauseEvidence: boolean
  remediationStatus?: string | null
  verificationRequired: boolean
  verificationStatus?: string | null
  hasResolutionEvidence?: boolean
  wasReopened?: boolean
}

const transitions: Record<GovernedIncidentLifecycleState, readonly GovernedIncidentLifecycleState[]> = {
  DETECTED: ['TRIAGED', 'INVESTIGATING', 'BLOCKED'],
  TRIAGED: ['INVESTIGATING', 'ROOT_CAUSE_IDENTIFIED', 'BLOCKED'],
  INVESTIGATING: ['ROOT_CAUSE_IDENTIFIED', 'REMEDIATION_PLANNED', 'BLOCKED'],
  ROOT_CAUSE_IDENTIFIED: ['REMEDIATION_PLANNED', 'REMEDIATION_IN_PROGRESS', 'BLOCKED'],
  REMEDIATION_PLANNED: ['REMEDIATION_IN_PROGRESS', 'VERIFICATION_PENDING', 'BLOCKED'],
  REMEDIATION_IN_PROGRESS: ['VERIFICATION_PENDING', 'VERIFYING', 'BLOCKED'],
  VERIFICATION_PENDING: ['VERIFYING', 'VERIFICATION_FAILED', 'BLOCKED'],
  VERIFYING: ['VERIFIED_RESOLVED', 'VERIFICATION_FAILED', 'BLOCKED'],
  VERIFIED_RESOLVED: ['REOPENED'],
  VERIFICATION_FAILED: ['REOPENED', 'REMEDIATION_PLANNED', 'REMEDIATION_IN_PROGRESS'],
  RESOLUTION_RECORDED: ['REOPENED', 'VERIFICATION_PENDING'],
  REOPENED: ['INVESTIGATING', 'ROOT_CAUSE_IDENTIFIED', 'REMEDIATION_PLANNED', 'BLOCKED'],
  BLOCKED: ['INVESTIGATING', 'ROOT_CAUSE_IDENTIFIED', 'REMEDIATION_PLANNED', 'REMEDIATION_IN_PROGRESS', 'VERIFICATION_PENDING'],
}

function upper(value: string | null | undefined) {
  return String(value ?? '').trim().toUpperCase()
}

function isResolvedIssueStatus(value: string | null | undefined) {
  return ['RESOLVED', 'CLOSED'].includes(upper(value))
}

export function canTransitionIncidentLifecycle(
  from: GovernedIncidentLifecycleState,
  to: GovernedIncidentLifecycleState,
): boolean {
  return from === to || transitions[from].includes(to)
}

export function assertIncidentLifecycleTransition(
  from: GovernedIncidentLifecycleState,
  to: GovernedIncidentLifecycleState,
): void {
  if (!canTransitionIncidentLifecycle(from, to)) {
    throw new Error(`Invalid governed incident lifecycle transition: ${from} -> ${to}`)
  }
}

export function deriveIncidentLifecycleState(signals: IncidentLifecycleSignals): GovernedIncidentLifecycleState {
  const issueStatus = upper(signals.issueStatus)
  const remediationStatus = upper(signals.remediationStatus)
  const verificationStatus = upper(signals.verificationStatus)
  const issueResolved = isResolvedIssueStatus(issueStatus)
  const verificationPreviouslyPassed = ['VERIFIED', 'VERIFIED_RESOLVED', 'PASSED'].includes(verificationStatus)

  // Current issue truth always outranks historical verification evidence. A previously
  // verified issue that is now non-terminal is reopened, never still "verified resolved".
  if (signals.wasReopened || (verificationPreviouslyPassed && !issueResolved)) return 'REOPENED'
  if (issueStatus === 'BLOCKED') return 'BLOCKED'

  if (verificationPreviouslyPassed && issueResolved) {
    return 'VERIFIED_RESOLVED'
  }
  if (['VERIFICATION_FAILED', 'FAILED', 'FAIL'].includes(verificationStatus) && issueResolved) {
    return 'VERIFICATION_FAILED'
  }
  if (['VERIFYING', 'RUNNING', 'IN_PROGRESS'].includes(verificationStatus) && issueResolved) {
    return 'VERIFYING'
  }
  if (signals.verificationRequired && issueResolved) {
    return verificationStatus === 'QUEUED' ? 'VERIFYING' : 'VERIFICATION_PENDING'
  }
  if (!signals.verificationRequired && issueResolved && signals.hasResolutionEvidence) {
    return 'RESOLUTION_RECORDED'
  }

  if (['IN_PROGRESS', 'EXECUTING', 'APPLYING'].includes(remediationStatus)) return 'REMEDIATION_IN_PROGRESS'
  if (['PLANNED', 'APPROVED', 'READY'].includes(remediationStatus)) return 'REMEDIATION_PLANNED'
  if (signals.hasRootCauseEvidence) return 'ROOT_CAUSE_IDENTIFIED'
  if (issueStatus === 'TRIAGED') return 'TRIAGED'
  if (issueStatus === 'IN_PROGRESS') return 'INVESTIGATING'
  return 'DETECTED'
}

export function assertGovernedIncidentTruthInvariant(incident: GovernedIncident): void {
  const { truth } = incident
  if (!truth.incidentId || !truth.projectId || !truth.issueId) {
    throw new Error('Governed incident truth requires incidentId, projectId and issueId.')
  }
  if (incident.truthBoundary !== 'GOVERNED_OUTCOME_ONLY') {
    throw new Error('Governed incident truth boundary must remain GOVERNED_OUTCOME_ONLY.')
  }
  if (incident.authorizationBoundary !== 'EXTERNAL_TO_PRESENTATION_ENGINE') {
    throw new Error('Governed incident authorization must remain external to presentation.')
  }
  if (truth.lifecycleState === 'VERIFIED_RESOLVED') {
    if (!isResolvedIssueStatus(truth.issueStatus)) {
      throw new Error('VERIFIED_RESOLVED requires the governance issue itself to remain RESOLVED or CLOSED.')
    }
    if (incident.verification.required) {
      const status = upper(incident.verification.status)
      if (!['VERIFIED', 'VERIFIED_RESOLVED', 'PASSED'].includes(status)) {
        throw new Error('VERIFIED_RESOLVED requires authoritative verification evidence.')
      }
    }
  }
  if (!isResolvedIssueStatus(truth.issueStatus) && truth.resolvedAt) {
    throw new Error('Non-terminal governance issues must not retain resolvedAt.')
  }
}
