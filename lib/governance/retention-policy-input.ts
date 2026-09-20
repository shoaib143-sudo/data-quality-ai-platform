export class RetentionPolicyInputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'RetentionPolicyInputError'
  }
}

function record(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RetentionPolicyInputError('Retention request body must be a JSON object.')
  }
  return value as Record<string, unknown>
}

function boundedInteger(
  body: Record<string, unknown>,
  key: string,
  fallback: number,
  minimum: number,
  maximum?: number,
) {
  const raw = body[key]
  if (raw === undefined) return fallback
  if (raw === null || (typeof raw !== 'number' && typeof raw !== 'string')) {
    throw new RetentionPolicyInputError(`${key} must be a finite number.`)
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) throw new RetentionPolicyInputError(`${key} must be a finite number.`)
  const integer = Math.floor(value)
  return maximum === undefined
    ? Math.max(minimum, integer)
    : Math.min(maximum, Math.max(minimum, integer))
}

export function parseRetentionPolicyPatch(value: unknown) {
  const body = record(value)
  return {
    profileHistoryDays: boundedInteger(body, 'profileHistoryDays', 365, 30),
    agentJobHistoryDays: boundedInteger(body, 'agentJobHistoryDays', 180, 30),
    minimumProfileRuns: boundedInteger(body, 'minimumProfileRuns', 5, 2, 100),
    minimumAgentRuns: boundedInteger(body, 'minimumAgentRuns', 50, 10, 1000),
    enabled: body.enabled === true,
    legalHold: body.legalHold === true,
  }
}

export function parseRetentionRunRequest(value: unknown) {
  const body = record(value)
  if (body.action !== 'RUN_NOW' || body.confirm !== true) {
    throw new RetentionPolicyInputError('action=RUN_NOW and confirm=true are required.')
  }
  return { action: 'RUN_NOW' as const, confirm: true as const }
}
