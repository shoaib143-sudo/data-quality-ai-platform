export type GovernanceFailureClass =
  | 'TRANSIENT_RETRY_SAFE'
  | 'APPROVAL_REQUIRED'
  | 'POLICY_BLOCKED'
  | 'RUNTIME_SYSTEM_DEFECT'
  | 'SECURITY_INCIDENT'
  | 'UNSAFE_AMBIGUOUS'

export type GovernanceRecoveryDisposition =
  | 'RETRY_SAFE'
  | 'REQUIRES_APPROVAL'
  | 'BLOCKED_POLICY'
  | 'DEBUGGER_REQUIRED'
  | 'SECURITY_ESCALATION'
  | 'FAIL_CLOSED'

export type RuntimeDebuggingOutcome =
  | 'RECOVERED_AND_REVALIDATED'
  | 'RETRY_SAFE'
  | 'REQUIRES_APPROVAL'
  | 'REQUIRES_ROLLBACK'
  | 'NOT_RECOVERABLE'
  | 'SECURITY_ESCALATION'

export type FailureSignal = {
  code?: string | null
  message?: string | null
  retryable?: boolean | null
  approvalRequired?: boolean | null
  policyDenied?: boolean | null
  securityRelevant?: boolean | null
  runtimeDefect?: boolean | null
  ambiguous?: boolean | null
  attempt?: number | null
  maxAttempts?: number | null
}

export type FailureClassification = {
  failureClass: GovernanceFailureClass
  disposition: GovernanceRecoveryDisposition
  reason: string
  retryAllowed: boolean
}

export type DebuggerInput = {
  failingRunId: string
  failingStepId: string
  correlationId: string
  agentKey: string
  toolKey?: string | null
  errorCode?: string | null
  sanitizedInput: unknown
  boundedLogs: string[]
  previousAttempts: number
  dependencyStates: Record<string, string>
  policySnapshotId: string
  evidenceRefs: Array<{ type: string; id: string; hash?: string | null }>
  lastKnownGoodCheckpoint?: string | null
}

export function classifyGovernanceFailure(signal: FailureSignal): FailureClassification {
  const attempt = Number.isInteger(signal.attempt) && (signal.attempt ?? 0) >= 0 ? Number(signal.attempt) : 0
  const maxAttempts = Number.isInteger(signal.maxAttempts) && (signal.maxAttempts ?? 0) >= 0 ? Number(signal.maxAttempts) : 0
  if (signal.securityRelevant) {
    return { failureClass: 'SECURITY_INCIDENT', disposition: 'SECURITY_ESCALATION', reason: 'Security-relevant failure requires governed escalation.', retryAllowed: false }
  }
  if (signal.policyDenied) {
    return { failureClass: 'POLICY_BLOCKED', disposition: 'BLOCKED_POLICY', reason: 'Policy denied the attempted action.', retryAllowed: false }
  }
  if (signal.approvalRequired) {
    return { failureClass: 'APPROVAL_REQUIRED', disposition: 'REQUIRES_APPROVAL', reason: 'Explicit approval is required before execution can continue.', retryAllowed: false }
  }
  if (signal.runtimeDefect) {
    return { failureClass: 'RUNTIME_SYSTEM_DEFECT', disposition: 'DEBUGGER_REQUIRED', reason: 'Runtime or system defect requires governed debugging.', retryAllowed: false }
  }
  if (signal.retryable === true && attempt < maxAttempts) {
    return { failureClass: 'TRANSIENT_RETRY_SAFE', disposition: 'RETRY_SAFE', reason: 'Transient failure is within the bounded retry budget.', retryAllowed: true }
  }
  if (signal.ambiguous || signal.retryable == null) {
    return { failureClass: 'UNSAFE_AMBIGUOUS', disposition: 'FAIL_CLOSED', reason: 'Failure class is ambiguous; execution must fail closed.', retryAllowed: false }
  }
  return { failureClass: 'UNSAFE_AMBIGUOUS', disposition: 'FAIL_CLOSED', reason: 'Failure is not safely recoverable within policy.', retryAllowed: false }
}

export function validateDebuggerInput(input: DebuggerInput) {
  const failures: string[] = []
  if (!input.failingRunId) failures.push('Missing failing run id.')
  if (!input.failingStepId) failures.push('Missing failing step id.')
  if (!input.correlationId) failures.push('Missing correlation id.')
  if (!input.agentKey) failures.push('Missing failing agent identity.')
  if (!input.policySnapshotId) failures.push('Missing policy snapshot id.')
  if (!Number.isInteger(input.previousAttempts) || input.previousAttempts < 0) failures.push('Invalid previous attempt count.')
  if (!Array.isArray(input.boundedLogs)) failures.push('Bounded logs are required.')
  if (!Array.isArray(input.evidenceRefs)) failures.push('Evidence references are required.')
  return failures
}

export function debuggerOutcomeRequiresOriginalStepRevalidation(outcome: RuntimeDebuggingOutcome) {
  return outcome === 'RECOVERED_AND_REVALIDATED' || outcome === 'RETRY_SAFE'
}

export function canMarkOriginalStepSucceeded(input: {
  debuggerOutcome: RuntimeDebuggingOutcome
  originalStepReexecuted: boolean
  originalExitGatePassed: boolean
}) {
  if (input.debuggerOutcome !== 'RECOVERED_AND_REVALIDATED') return false
  return input.originalStepReexecuted && input.originalExitGatePassed
}
