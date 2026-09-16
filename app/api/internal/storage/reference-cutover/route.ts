import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireInternalBearer } from '@/lib/security/internal-bearer'

export const dynamic = 'force-dynamic'

const DEFAULT_BATCH = 10
const MAX_BATCH = 50

type Mode = 'dry-run' | 'apply' | 'rollback'

type StorageRow = {
  id: string
  project_id: string
  provider: 'supabase' | 'r2'
  state: string
  size_bytes: number | null
  checksum: string | null
  checksum_algorithm: string | null
  metadata: Record<string, unknown> | null
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

function batchSize() {
  const parsed = Number(process.env.STORAGE_REFERENCE_CUTOVER_BATCH_SIZE)
  return Number.isFinite(parsed) ? Math.min(MAX_BATCH, Math.max(1, Math.floor(parsed))) : DEFAULT_BATCH
}

function approved(name: 'STORAGE_R2_REFERENCE_CUTOVER_APPROVED' | 'STORAGE_R2_REFERENCE_ROLLBACK_APPROVED') {
  return process.env[name]?.trim().toLowerCase() === 'true'
}

function sourceStorageId(row: StorageRow) {
  const value = row.metadata?.source_storage_object_id
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function integrityEquivalent(source: StorageRow, target: StorageRow) {
  if (source.state !== 'READY' || target.state !== 'READY') return false
  if (source.project_id !== target.project_id) return false
  if (source.size_bytes == null || target.size_bytes == null || Number(source.size_bytes) !== Number(target.size_bytes)) return false
  if (target.checksum_algorithm !== 'sha256' || !target.checksum) return false
  if (source.checksum_algorithm === 'sha256' && source.checksum && source.checksum !== target.checksum) return false
  return true
}

export async function POST(request: Request) {
  if (!requireInternalBearer(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })

  let body: Record<string, unknown> = {}
  try {
    body = await request.json()
  } catch {
    // Empty body is a dry-run by default.
  }
  const mode: Mode = body.mode === 'apply' || body.mode === 'rollback' ? body.mode : 'dry-run'
  if (mode === 'apply' && !approved('STORAGE_R2_REFERENCE_CUTOVER_APPROVED')) {
    return NextResponse.json({ error: 'R2 reference cutover is not approved.' }, { status: 409 })
  }
  if (mode === 'rollback' && !approved('STORAGE_R2_REFERENCE_ROLLBACK_APPROVED')) {
    return NextResponse.json({ error: 'R2 reference rollback is not approved.' }, { status: 409 })
  }

  const admin = createAdminClient()
  const { data: r2Rows, error: r2Error } = await admin
    .schema('catalog')
    .from('storage_objects')
    .select('id, project_id, provider, state, size_bytes, checksum, checksum_algorithm, metadata')
    .eq('provider', 'r2')
    .eq('owner_type', 'MIGRATION_COPY')
    .eq('state', 'READY')
    .order('verified_at', { ascending: true })
    .limit(batchSize())
  if (r2Error) return NextResponse.json({ error: `Unable to load verified R2 migration objects: ${r2Error.message}` }, { status: 500 })

  const targets = (r2Rows ?? []) as StorageRow[]
  const sourceIds = [...new Set(targets.map(sourceStorageId).filter((value): value is string => Boolean(value)))]
  if (sourceIds.length === 0) {
    return NextResponse.json({ mode, examinedTargets: targets.length, eligibleReferences: 0, changedReferences: 0, destructiveActions: 0, results: [] })
  }

  const [{ data: sourceRows, error: sourceError }, { data: versionRows, error: versionError }, { data: datasetRows, error: datasetError }] = await Promise.all([
    admin
      .schema('catalog')
      .from('storage_objects')
      .select('id, project_id, provider, state, size_bytes, checksum, checksum_algorithm, metadata')
      .in('id', sourceIds),
    admin
      .schema('catalog')
      .from('dataset_versions')
      .select('id, dataset_id, storage_object_id')
      .in('storage_object_id', mode === 'rollback' ? targets.map((row) => row.id) : sourceIds),
    admin
      .schema('catalog')
      .from('datasets')
      .select('id, project_id'),
  ])
  const errors = [sourceError, versionError, datasetError].filter(Boolean)
  if (errors.length) return NextResponse.json({ error: `Reference cutover query failed: ${errors.map((error) => error?.message).join('; ')}` }, { status: 500 })

  const sourcesById = new Map(((sourceRows ?? []) as StorageRow[]).map((row) => [row.id, row]))
  const targetBySourceId = new Map<string, StorageRow>()
  for (const target of targets) {
    const sourceId = sourceStorageId(target)
    if (sourceId) targetBySourceId.set(sourceId, target)
  }
  const sourceByTargetId = new Map<string, StorageRow>()
  for (const target of targets) {
    const sourceId = sourceStorageId(target)
    const source = sourceId ? sourcesById.get(sourceId) : undefined
    if (source) sourceByTargetId.set(target.id, source)
  }
  const datasetProjectById = new Map(((datasetRows ?? []) as DatasetRow[]).map((row) => [row.id, row.project_id]))

  let eligibleReferences = 0
  let changedReferences = 0
  const results: Array<Record<string, unknown>> = []

  for (const version of (versionRows ?? []) as VersionRow[]) {
    const currentId = version.storage_object_id
    const source = mode === 'rollback'
      ? (currentId ? sourceByTargetId.get(currentId) : undefined)
      : (currentId ? sourcesById.get(currentId) : undefined)
    const target = source ? targetBySourceId.get(source.id) : undefined
    const datasetProject = datasetProjectById.get(version.dataset_id)

    if (!source || !target) {
      results.push({ datasetVersionId: version.id, action: 'SKIPPED_MISSING_PAIR' })
      continue
    }
    if (!datasetProject || datasetProject !== source.project_id || datasetProject !== target.project_id) {
      results.push({ datasetVersionId: version.id, action: 'SKIPPED_PROJECT_MISMATCH' })
      continue
    }
    if (!integrityEquivalent(source, target)) {
      results.push({ datasetVersionId: version.id, action: 'SKIPPED_INTEGRITY_MISMATCH' })
      continue
    }

    eligibleReferences += 1
    const desiredId = mode === 'rollback' ? source.id : target.id
    if (mode === 'dry-run') {
      results.push({ datasetVersionId: version.id, action: 'ELIGIBLE', currentProvider: source.id === currentId ? 'supabase' : 'r2', desiredProvider: 'r2' })
      continue
    }

    const expectedCurrentId = mode === 'rollback' ? target.id : source.id
    const { data: changed, error: updateError } = await admin
      .schema('catalog')
      .from('dataset_versions')
      .update({ storage_object_id: desiredId })
      .eq('id', version.id)
      .eq('storage_object_id', expectedCurrentId)
      .select('id')
      .maybeSingle()
    if (updateError) {
      results.push({ datasetVersionId: version.id, action: 'ERROR', error: updateError.message })
      continue
    }
    if (!changed) {
      results.push({ datasetVersionId: version.id, action: 'SKIPPED_CONCURRENT_CHANGE' })
      continue
    }

    changedReferences += 1
    results.push({ datasetVersionId: version.id, action: mode === 'rollback' ? 'ROLLED_BACK_TO_SUPABASE' : 'CUT_OVER_TO_R2' })
  }

  return NextResponse.json({
    mode,
    examinedTargets: targets.length,
    eligibleReferences,
    changedReferences,
    destructiveActions: 0,
    sourceObjectsDeleted: 0,
    targetObjectsDeleted: 0,
    results,
  })
}
