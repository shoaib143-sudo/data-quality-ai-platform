/**
 * Read-only onboarding preflight for a real user's GUIDED E2E journey.
 * These statuses are catalog evidence, never proof of live source connectivity
 * or the success of profiling, specialist execution, or certification.
 */
export type GuidedSourceScope = {
  sourceId: string
  sourceName: string
  scopeVersionId?: string
  versionNumber: number
  mode: string
  qualifiedNames: string[]
}
export type GuidedDataset = {
  id: string
  dataSourceId: string
  sourceIdentifier: string | null
  status: string
}
export type GuidedDatasetVersion = { id: string; datasetId: string; versionNumber: number; status: string }
export type GuidedExecutionSource = { datasetVersionId: string; active: boolean }
export type GuidedProfileReadiness = { datasetVersionId: string; ready: boolean; blockerCodes: string[] }
export type GuidedDiscoveredAsset = { sourceId: string; assetKey: string; isCurrent: boolean }
export type GuidedTableStatus =
  | 'NOT_DISCOVERED'
  | 'NOT_REGISTERED'
  | 'VERSION_NOT_AVAILABLE'
  | 'EXECUTION_SOURCE_MISSING'
  | 'PROFILE_READINESS_BLOCKED'
  | 'REGISTERED_READY'
export type GuidedTable = {
  sourceId: string
  sourceName: string
  qualifiedName: string
  status: GuidedTableStatus
  datasetVersionId: string | null
  blockerCodes?: string[]
}
export type GuidedReadiness = {
  ready: boolean
  expectedCount: number
  readyCount: number
  selectedSourceId?: string | null
  sourceOptions?: { id: string; name: string }[]
  scopes: { sourceId: string; sourceName: string; scopeVersionId?: string; versionNumber: number; mode: string; count: number }[]
  tables: GuidedTable[]
}

export function assessGuidedReadiness(input: {
  scopes: GuidedSourceScope[]
  datasets: GuidedDataset[]
  versions: GuidedDatasetVersion[]
  executionSources: GuidedExecutionSource[]
  discoveredAssets: GuidedDiscoveredAsset[]
  profileReadiness?: GuidedProfileReadiness[]
}): GuidedReadiness {
  const datasets = new Map<string, GuidedDataset>()
  for (const row of input.datasets) {
    if (row.sourceIdentifier) datasets.set(JSON.stringify([row.dataSourceId, row.sourceIdentifier]), row)
  }
  const versions = new Map<string, GuidedDatasetVersion[]>()
  for (const row of input.versions) {
    versions.set(row.datasetId, [...(versions.get(row.datasetId) ?? []), row])
  }
  for (const rows of versions.values()) rows.sort((a, b) => b.versionNumber - a.versionNumber)
  const activeBindings = new Set(input.executionSources.filter(row => row.active).map(row => row.datasetVersionId))
  const profileReadiness = new Map((input.profileReadiness ?? []).map(row => [row.datasetVersionId, row]))
  const requireProfileEvidence = input.profileReadiness !== undefined
  const discovered = new Set(input.discoveredAssets.filter(row => row.isCurrent).map(row => JSON.stringify([row.sourceId, row.assetKey])))
  const tables: GuidedTable[] = []
  const scopes: GuidedReadiness['scopes'] = []
  const seen = new Set<string>()

  for (const scope of input.scopes) {
    const names = scope.mode === 'SELECTED' ? scope.qualifiedNames.map(name => name.trim()).filter(Boolean) : []
    scopes.push({
      sourceId: scope.sourceId,
      sourceName: scope.sourceName,
      scopeVersionId: scope.scopeVersionId,
      versionNumber: scope.versionNumber,
      mode: scope.mode,
      count: names.length,
    })
    for (const qualifiedName of names) {
      const key = JSON.stringify([scope.sourceId, qualifiedName])
      if (seen.has(key)) continue
      seen.add(key)
      const dataset = datasets.get(key)
      const version = dataset ? versions.get(dataset.id)?.[0] : undefined
      let status: GuidedTableStatus
      if (!discovered.has(key)) status = 'NOT_DISCOVERED'
      else if (!dataset || dataset.status !== 'ACTIVE') status = 'NOT_REGISTERED'
      else if (!version || version.status !== 'AVAILABLE') status = 'VERSION_NOT_AVAILABLE'
      else if (!activeBindings.has(version.id)) status = 'EXECUTION_SOURCE_MISSING'
      else if (requireProfileEvidence && profileReadiness.get(version.id)?.ready !== true) status = 'PROFILE_READINESS_BLOCKED'
      else status = 'REGISTERED_READY'
      tables.push({
        sourceId: scope.sourceId, sourceName: scope.sourceName, qualifiedName,
        status, datasetVersionId: version?.id ?? null,
        blockerCodes: version ? profileReadiness.get(version.id)?.blockerCodes ?? [] : [],
      })
    }
  }
  tables.sort((a, b) => a.qualifiedName.localeCompare(b.qualifiedName))
  const readyCount = tables.filter(table => table.status === 'REGISTERED_READY').length
  // An absent or dynamic/unbounded selection cannot be certified by this
  // enumerated-table preflight. A separate discovery check is required.
  return {
    ready: tables.length > 0 && readyCount === tables.length && scopes.length > 0
      && scopes.every(scope => scope.mode === 'SELECTED' && scope.count > 0),
    expectedCount: tables.length,
    readyCount, scopes, tables,
  }
}
