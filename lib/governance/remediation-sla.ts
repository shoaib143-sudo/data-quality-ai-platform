export type RemediationSlaState = 'RESOLVED' | 'NOT_SET' | 'DUE' | 'OVERDUE' | 'INVALID'

const terminalStatuses = new Set(['RESOLVED', 'CLOSED', 'CANCELLED', 'REJECTED'])

function normalized(value: unknown) {
  return String(value ?? '').trim().toUpperCase()
}

export function classifyRemediationSla(input: {
  status: string | null | undefined
  dueAt: string | null | undefined
  nowMs?: number
}): RemediationSlaState {
  if (terminalStatuses.has(normalized(input.status))) return 'RESOLVED'
  if (!input.dueAt) return 'NOT_SET'

  const dueMs = Date.parse(input.dueAt)
  if (!Number.isFinite(dueMs)) return 'INVALID'

  const nowMs = Number.isFinite(input.nowMs) ? Number(input.nowMs) : Date.now()
  return dueMs < nowMs ? 'OVERDUE' : 'DUE'
}
