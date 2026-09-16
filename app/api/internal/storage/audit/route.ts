import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireInternalBearer } from '@/lib/security/internal-bearer'

export const dynamic = 'force-dynamic'

type StorageRow = {
  id: string
  project_id: string
  provider: 'supabase' | 'r2'
  state: string
  owner_type: string
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

function hasR2RuntimeConfiguration() {
  return ['R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET', 'R2_ENDPOINT', 'R2_PREFIX']
    .every((name) => Boolean(process.env[name]?.trim()))
}

function selectedProvider() {
  const value = (process.env.STORAGE_DEFAULT_PROVIDER ?? 'supabase').trim().toLowerCase()
  return value === 'r2' ? 'r2' : 'supabase'
}

function productionCutoverApproved() {
  return process.env.STORAGE_R2_PRODUCTION_CUTOVER_APPROVED?.trim().toLowerCase() === 'true'
}

export async function GET(request: Request) {
  if (!requireInternalBearer(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  const admin = createAdminClient()
  const [storageResult, versionsResult, datasetsResult] = await Promise.all([
    admin
      .schema('catalog')
      .from('storage_objects')
      .select('id, project_id, provider, state, owner_type, size_bytes, verified_at, deleted_at'),
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
  const legacyAwaitingVerification = storageRows.filter(
    (row) => row.owner_type === 'LEGACY_UPLOAD' && row.state === 'UPLOADED',
  ).length
  const r2ReadyObjects = storageRows.filter((row) => row.provider === 'r2' && row.state === 'READY').length
  const r2NonReadyObjects = storageRows.filter(
    (row) => row.provider === 'r2' && !['READY', 'DELETED'].includes(row.state),
  ).length

  const criticalFindings = referencedNonReady + crossProjectReferences + readyMissingIntegrityMetadata + deletedMissingTimestamp
  const r2RuntimeConfigured = hasR2RuntimeConfiguration()
  const defaultProvider = selectedProvider()
  const cutoverApproved = productionCutoverApproved()
  const preCutoverReady = criticalFindings === 0
    && legacyAwaitingVerification === 0
    && r2RuntimeConfigured
    && r2ReadyObjects > 0
    && r2NonReadyObjects === 0

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
    migration: {
      legacyAwaitingVerification,
      r2ReadyObjects,
      r2NonReadyObjects,
    },
    cutover: {
      r2RuntimeConfigured,
      defaultProvider,
      productionCutoverApproved: cutoverApproved,
      preCutoverReady,
      productionCutoverActive: defaultProvider === 'r2' && cutoverApproved,
    },
    destructiveActions: 0,
  }, { status: criticalFindings === 0 ? 200 : 503 })
}
