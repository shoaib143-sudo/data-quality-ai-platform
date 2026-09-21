export function resolveMonitorRoute(input: {
  runId?: string | null
  monitorUrl?: string | null
}) {
  const runId = typeof input.runId === 'string' ? input.runId.trim() : ''
  const fallback = runId ? `/monitoring?run=${encodeURIComponent(runId)}` : '/monitoring'
  const candidate = typeof input.monitorUrl === 'string' ? input.monitorUrl.trim() : ''
  return /^\/monitoring(?:\?|$)/.test(candidate) ? candidate : fallback
}
