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


export function profilingRecoveryStartOrder(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const stageValue = (value as Record<string, unknown>).retry_stage
  const stage = typeof stageValue === 'string' ? stageValue.trim().toUpperCase() : ''
  if (['PROFILE_RUN', 'SCHEMA_DISCOVERY', 'PROFILE_COLUMNS'].includes(stage)) return 1
  if (['METRIC_EXECUTION', 'METRIC_PERSISTENCE'].includes(stage)) return 2
  if (['FINDINGS_GENERATION', 'QUALITY_SCORING', 'GOVERNANCE_INSIGHTS'].includes(stage)) return 3
  return null
}
