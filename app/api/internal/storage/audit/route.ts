import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireInternalBearer } from '@/lib/security/internal-bearer'

export const dynamic = 'force-dynamic'

type StorageRow = {
  id: string
  project_id: string
  provider: 'supabase' | 'r2'
  state: string
  size_bytes: number | null
  verified_at: string | null
  deleted_at: string | null
}

type VersionRow = {
  id: string
  dataset_id: string
  storage_object_id: string | null
}

type DatasetRow = {
  id: string
  project_id: string
}

export async function GET(request: Request) {
  if (!requireInternalBearer(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const admin = createAdminClient()
  const [storageResult, versionsResult, datasetsResult] = await Promise.all([
    admin
      .schema('catalog')
      .from('storage_objects')
      .select('id, project_id, provider, state, size_bytes, verified_at, deleted_at'),
    admin
      .schema('catalog')
      .from('dataset_versions')
      .select('id, dataset_id, storage_object_id')
      .not('storage_object_id', 'is', null),
    admin
      .schema('catalog')
      .from('datasets')
      .select('id, project_id'),
  ])

  const errors = [storageResult.error, versionsResult.error, datasetsResult.error].filter(Boolean)
  if (errors.length) {
    return NextResponse.json({ error: `Storage audit query failed: ${errors.map((error) => error?.message).join('; ')}` }, { status: 500 })
  }

  const storageRows = (storageResult.data ?? []) as StorageRow[]
  const versionRows = (versionsResult.data ?? []) as VersionRow[]
  const datasetRows = (datasetsResult.data ?? []) as DatasetRow[]
  const storageById = new Map(storageRows.map((row) => [row.id, row]))
  const datasetProjectById = new Map(datasetRows.map((row) => [row.id, row.project_id]))
  const referencedStorageIds = new Set(versionRows.flatMap((row) => row.storage_object_id ? [row.storage_object_id] : []))

  const providerStateCounts: Record<string, number> = {}
  for (const row of storageRows) {
    const key = `${row.provider}:${row.state}`
    providerStateCounts[key] = (providerStateCounts[key] ?? 0) + 1
  }

  const referencedNonReady = versionRows.filter((version) => {
    const storage = version.storage_object_id ? storageById.get(version.storage_object_id) : undefined
    return !storage || storage.state !== 'READY'
  }).length

  const crossProjectReferences = versionRows.filter((version) => {
    const storage = version.storage_object_id ? storageById.get(version.storage_object_id) : undefined
    const datasetProject = datasetProjectById.get(version.dataset_id)
    return Boolean(storage && datasetProject && storage.project_id !== datasetProject)
  }).length

  const readyMissingIntegrityMetadata = storageRows.filter(
    (row) => row.state === 'READY' && (!row.verified_at || row.size_bytes == null),
  ).length
  const deletedMissingTimestamp = storageRows.filter(
    (row) => row.state === 'DELETED' && !row.deleted_at,
  ).length
  const unreferencedReadyObjects = storageRows.filter(
    (row) => row.state === 'READY' && !referencedStorageIds.has(row.id),
  ).length

  const criticalFindings = referencedNonReady + crossProjectReferences + readyMissingIntegrityMetadata + deletedMissingTimestamp

  return NextResponse.json({
    ok: criticalFindings === 0,
    generatedAt: new Date().toISOString(),
    totals: {
      registryObjects: storageRows.length,
      referencedDatasetVersions: versionRows.length,
    },
    providerStateCounts,
    findings: {
      referencedNonReady,
      crossProjectReferences,
      readyMissingIntegrityMetadata,
      deletedMissingTimestamp,
      unreferencedReadyObjects,
      criticalFindings,
    },
    destructiveActions: 0,
  }, { status: criticalFindings === 0 ? 200 : 503 })
}
