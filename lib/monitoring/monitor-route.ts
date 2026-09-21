export function resolveMonitorRoute(input: {
  runId?: string | null
  monitorUrl?: string | null
}) {
  const runId = typeof input.runId === 'string' ? input.runId.trim() : ''
  const fallback = runId ? `/monitoring?run=${encodeURIComponent(runId)}` : '/monitoring'
  const candidate = typeof input.monitorUrl === 'string' ? input.monitorUrl.trim() : ''
  if (!/^\/monitoring(?:\?|$)/.test(candidate)) return fallback

  try {
    const parsed = new URL(candidate, 'https://datanexus.local')
    if (parsed.pathname !== '/monitoring') return fallback
    const candidateRunId = parsed.searchParams.get('run')
    if (runId && candidateRunId !== runId) return fallback
    return candidate
  } catch {
    return fallback
  }
}
