const TERMINAL_STATUSES = new Set(['RESOLVED', 'CLOSED'])

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function isTerminalIssueStatus(value: unknown): boolean {
  return TERMINAL_STATUSES.has(text(value).toUpperCase())
}

export function effectiveResolutionSummary(existing: unknown, incoming: unknown, incomingProvided: boolean): string {
  return incomingProvided ? text(incoming) : text(existing)
}

export function deriveIssueResolutionMutation(input: {
  previousStatus: unknown
  nextStatus: unknown
  previousResolvedAt: string | null
  now: string
}) {
  const wasResolved = isTerminalIssueStatus(input.previousStatus)
  const willBeResolved = isTerminalIssueStatus(input.nextStatus)
  const resolvingNow = !wasResolved && willBeResolved
  const reopeningNow = wasResolved && !willBeResolved

  return {
    wasResolved,
    willBeResolved,
    resolvingNow,
    reopeningNow,
    resolvedAt: willBeResolved
      ? (input.previousResolvedAt || input.now)
      : null,
  }
}

export function requiresGovernedResolutionEvidence(input: {
  governedRemediation: boolean
  nextStatus: unknown
  effectiveSummary: string
}): boolean {
  return input.governedRemediation
    && isTerminalIssueStatus(input.nextStatus)
    && !input.effectiveSummary.trim()
}

export function shouldCompensateVerificationSchedulingFailure(input: {
  governedRemediation: boolean
  resolvingNow: boolean
}): boolean {
  return input.governedRemediation && input.resolvingNow
}
