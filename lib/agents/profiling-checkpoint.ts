export type ProfilingStepSnapshot = {
  id: string
  status?: string | null
  attempt?: number | null
  output?: unknown
}

export type ProfilingStepResumeDecision =
  | {
      mode: 'REUSE'
      id: string
      attempt: number
      output: Record<string, unknown>
    }
  | {
      mode: 'RESTART'
      id: string
      nextAttempt: number
    }

function objectOutput(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function decideProfilingStepResume(existing: ProfilingStepSnapshot): ProfilingStepResumeDecision {
  const attempt = Number.isInteger(existing.attempt) && Number(existing.attempt) > 0
    ? Number(existing.attempt)
    : 1

  if (existing.status === 'SUCCEEDED') {
    return {
      mode: 'REUSE',
      id: existing.id,
      attempt,
      output: objectOutput(existing.output),
    }
  }

  return {
    mode: 'RESTART',
    id: existing.id,
    nextAttempt: attempt + 1,
  }
}
