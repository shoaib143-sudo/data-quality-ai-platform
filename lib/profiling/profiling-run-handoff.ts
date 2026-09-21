type UnknownRecord = Record<string, unknown>

function record(value: unknown): UnknownRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as UnknownRecord : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export type ProfilingRunHandoff = {
  agentRunId: string
  monitorUrl: string
  reused: boolean
}

export function resolveProfilingRunHandoff(payload: unknown): ProfilingRunHandoff {
  const body = record(payload)
  const agentRunId = text(body.agentRunId)
  if (!agentRunId) throw new Error('Profiling job was accepted without an agent run identifier.')

  const fallback = `/monitoring?run=${encodeURIComponent(agentRunId)}`
  const candidate = text(body.monitorUrl)
  const monitorUrl = /^\/monitoring(?:\?|$)/.test(candidate) ? candidate : fallback

  return {
    agentRunId,
    monitorUrl,
    reused: body.reused === true,
  }
}
