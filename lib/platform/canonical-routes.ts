type RouteSegment = string | number

function normalizeBasePath(basePath: string) {
  const normalized = basePath.trim()
  if (!normalized.startsWith('/')) throw new Error('Canonical route base paths must start with /.')
  return normalized === '/' ? '' : normalized.replace(/\/+$/, '')
}

function segment(value: RouteSegment) {
  const normalized = String(value).trim()
  if (!normalized) throw new Error('Canonical route segments must be non-empty.')
  return encodeURIComponent(normalized)
}

export function canonicalResourcePath(basePath: string, ...identity: RouteSegment[]) {
  const base = normalizeBasePath(basePath)
  if (!identity.length) return base || '/'
  return `${base}/${identity.map(segment).join('/')}`
}

export const canonicalRoutes = {
  dashboard: '/dashboard',
  agents: '/agents',
  agent(agentKey: string, version: string) {
    return canonicalResourcePath('/agents', agentKey, version)
  },
  agentRun(runId: string) {
    return canonicalResourcePath('/agents/runs', runId)
  },
  datasets: '/datasets',
  governedDataset(datasetId: string) {
    return canonicalResourcePath('/catalog/dataset', datasetId)
  },
  datasetEdit(datasetId: string) {
    return `${canonicalResourcePath('/datasets/dataset', datasetId)}/edit`
  },
  sourceEdit(sourceId: string) {
    return canonicalResourcePath('/datasets/edit', sourceId)
  },
  dataQuality: '/data-quality',
  monitoring: '/monitoring',
  pricingAuthority: '/pricing-authority',
} as const

export type CanonicalRoutes = typeof canonicalRoutes
