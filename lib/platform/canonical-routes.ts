function segment(value: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error('Canonical route segments must be non-empty.')
  return encodeURIComponent(normalized)
}

export const canonicalRoutes = {
  agents: '/agents',
  agent(agentKey: string, version: string) {
    return `/agents/${segment(agentKey)}/${segment(version)}`
  },
  agentRun(runId: string) {
    return `/agents/runs/${segment(runId)}`
  },
  datasets: '/datasets',
  dataQuality: '/data-quality',
  monitoring: '/monitoring',
} as const

export type CanonicalRoutes = typeof canonicalRoutes
