const VERIFIED_OUTCOMES = new Set(['VERIFIED', 'VERIFIED_RESOLVED'])
const RESOLVED_ISSUE_STATES = new Set(['RESOLVED', 'CLOSED'])

function normalized(value: unknown) {
  return String(value ?? '').trim().toUpperCase()
}

export function isVerifiedRemediationClosure(input: {
  outcomeStatus: string | null | undefined
  issueStatuses: Array<string | null | undefined>
}) {
  if (!VERIFIED_OUTCOMES.has(normalized(input.outcomeStatus))) return false
  if (input.issueStatuses.length === 0) return true
  return input.issueStatuses.every(status => RESOLVED_ISSUE_STATES.has(normalized(status)))
}
