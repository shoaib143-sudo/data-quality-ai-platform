import { getObjectStore } from '@/lib/data-plane/object-store'
import { writeGovernanceAudit } from '@/lib/governance/audit'
import {
  HISTORICAL_EXPORT_KINDS,
  boundHistoricalExportChunkSize,
  boundHistoricalExportRetentionDays,
  normalizeHistoricalExportFilters,
  normalizeHistoricalExportKind,
  planHistoricalExportChunk,
  type HistoricalExportKind,
} from '@/lib/orchestration/historical-export-contract'
import { enqueueDurableJob, type DurableJob } from '@/lib/orchestration/queue'
import { createAdminClient } from '@/lib/supabase/admin'

type ExportPart = {
  part: number
  key: string
  rows: number
}

type ExportRow = Record<string, unknown>

type ExportJobRow = {
  id: string
  project_id: string
  requested_by: string | null
  export_kind: HistoricalExportKind
  status: 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  filters: Record<string, unknown>
  cursor_state: Record<string, unknown>
  object_parts: ExportPart[]
  manifest_key: string | null
  chunk_size: number
  snapshot_at: string
  part_count: number
  rows_exported: number
  idempotency_key: string | null
  expires_at: string
  last_error: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  updated_at: string
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function boundedOffset(cursor: Record<string, unknown>) {
  const numeric = Number(cursor.offset ?? 0)
  return Number.isFinite(numeric) ? Math.max(0, Math.trunc(numeric)) : 0
}


function objectParts(value: unknown): ExportPart[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const part = Number(record.part)
    const rows = Number(record.rows)
    const key = text(record.key)
    if (!Number.isInteger(part) || part < 1 || !Number.isFinite(rows) || rows < 0 || !key) return []
    return [{ part, rows: Math.trunc(rows), key }]
  })
}

function exportKey(exportId: string, part: number) {
  return `exports/${exportId}/part-${String(part).padStart(6, '0')}.ndjson`
}

function manifestKey(exportId: string) {
  return `exports/${exportId}/manifest.json`
}

async function loadExportJob(exportId: string, projectId?: string | null): Promise<ExportJobRow | null> {
  const admin = createAdminClient()
  let query = admin.schema('orchestration').from('export_jobs').select('*').eq('id', exportId)
  if (projectId) query = query.eq('project_id', projectId)
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(`Unable to load historical export: ${error.message}`)
  if (!data) return null
  return {
    ...data,
    filters: data.filters && typeof data.filters === 'object' && !Array.isArray(data.filters)
      ? data.filters as Record<string, unknown>
      : {},
    cursor_state: data.cursor_state && typeof data.cursor_state === 'object' && !Array.isArray(data.cursor_state)
      ? data.cursor_state as Record<string, unknown>
      : {},
    object_parts: objectParts(data.object_parts),
    rows_exported: Number(data.rows_exported ?? 0),
    part_count: Number(data.part_count ?? 0),
    chunk_size: Number(data.chunk_size ?? 500),
  } as ExportJobRow
}

async function enqueueExportPart(exportJob: Pick<ExportJobRow, 'id' | 'project_id' | 'part_count'>) {
  const nextPart = exportJob.part_count + 1
  return enqueueDurableJob({
    projectId: exportJob.project_id,
    jobType: 'EXPORT',
    entityId: exportJob.id,
    idempotencyKey: `export:${exportJob.id}:part:${nextPart}`,
    payload: { exportJobId: exportJob.id },
    priority: 150,
    maxAttempts: 5,
  })
}

export async function createHistoricalExport(input: {
  projectId: string
  requestedBy: string
  exportKind: HistoricalExportKind | string
  filters?: Record<string, unknown> | null
  chunkSize?: number
  retentionDays?: number
  idempotencyKey?: string | null
}) {
  const projectId = input.projectId.trim()
  const requestedBy = input.requestedBy.trim()
  if (!projectId || !requestedBy) throw new Error('projectId and requestedBy are required.')

  const exportKind = normalizeHistoricalExportKind(input.exportKind)
  const filters = normalizeHistoricalExportFilters(exportKind, input.filters)
  const chunkSize = boundHistoricalExportChunkSize(input.chunkSize)
  const retentionDays = boundHistoricalExportRetentionDays(input.retentionDays)
  const idempotencyKey = input.idempotencyKey?.trim() || null
  const admin = createAdminClient()

  if (idempotencyKey) {
    const existing = await admin.schema('orchestration').from('export_jobs')
      .select('*')
      .eq('project_id', projectId)
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle()
    if (existing.error) throw new Error(`Unable to resolve export idempotency: ${existing.error.message}`)
    if (existing.data) return loadExportJob(String(existing.data.id), projectId)
  }

  const snapshotAt = new Date().toISOString()
  const expiresAt = new Date(Date.now() + retentionDays * 24 * 60 * 60_000).toISOString()
  const { data, error } = await admin.schema('orchestration').from('export_jobs').insert({
    project_id: projectId,
    requested_by: requestedBy,
    export_kind: exportKind,
    filters,
    chunk_size: chunkSize,
    snapshot_at: snapshotAt,
    expires_at: expiresAt,
    idempotency_key: idempotencyKey,
  }).select('*').single()

  if (error || !data) throw new Error(`Unable to create historical export: ${error?.message ?? 'no export row returned'}`)
  const exportJob = await loadExportJob(String(data.id), projectId)
  if (!exportJob) throw new Error('Historical export disappeared after creation.')

  await writeGovernanceAudit({
    projectId,
    actorUserId: requestedBy,
    actorType: 'USER',
    eventType: 'HISTORICAL_EXPORT_REQUESTED',
    entityType: 'EXPORT_JOB',
    entityId: exportJob.id,
    metadata: {
      export_kind: exportKind,
      snapshot_at: exportJob.snapshot_at,
      expires_at: exportJob.expires_at,
    },
  })

  try {
    await enqueueExportPart(exportJob)
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    await admin.schema('orchestration').from('export_jobs').update({
      status: 'FAILED',
      last_error: message.slice(0, 4000),
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', exportJob.id).eq('project_id', projectId)
    throw cause
  }

  return exportJob
}

function applyRange<T extends {
  gte(column: string, value: string): T
  lte(column: string, value: string): T
}>(
  query: T,
  column: string,
  filters: Record<string, unknown>,
) {
  let result = query
  const from = text(filters.from)
  const to = text(filters.to)
  if (from) result = result.gte(column, from)
  if (to) result = result.lte(column, to)
  return result
}

async function loadAuditPage(job: ExportJobRow, offset: number): Promise<ExportRow[]> {
  const admin = createAdminClient()
  let query = admin.schema('governance').from('audit_events')
    .select('id,project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,correlation_id,metadata,created_at,previous_hash,event_hash')
    .eq('project_id', job.project_id)
    .lte('created_at', job.snapshot_at)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + job.chunk_size - 1)

  query = applyRange(query, 'created_at', job.filters)
  const actorType = text(job.filters.actorType)
  const eventPrefix = text(job.filters.eventPrefix)
  const entityType = text(job.filters.entityType)
  if (actorType) query = query.eq('actor_type', actorType)
  if (eventPrefix) query = query.like('event_type', `${eventPrefix}%`)
  if (entityType) query = query.eq('entity_type', entityType)

  const { data, error } = await query
  if (error) throw new Error(`Unable to export audit history: ${error.message}`)
  return (data ?? []) as ExportRow[]
}

async function loadAnalyticsPage(job: ExportJobRow, offset: number): Promise<ExportRow[]> {
  const admin = createAdminClient()
  let query = admin.schema('orchestration').from('analytics_events')
    .select('event_id,project_id,schema_version,event_type,occurred_at,aggregate_type,aggregate_id,aggregate_version,correlation_id,causation_id,actor_type,actor_id,payload,created_at')
    .eq('project_id', job.project_id)
    .lte('created_at', job.snapshot_at)
    .order('created_at', { ascending: true })
    .order('event_id', { ascending: true })
    .range(offset, offset + job.chunk_size - 1)

  query = applyRange(query, 'occurred_at', job.filters)
  const eventPrefix = text(job.filters.eventPrefix)
  const aggregateType = text(job.filters.aggregateType)
  if (eventPrefix) query = query.like('event_type', `${eventPrefix}%`)
  if (aggregateType) query = query.eq('aggregate_type', aggregateType)

  const { data, error } = await query
  if (error) throw new Error(`Unable to export analytics history: ${error.message}`)
  return (data ?? []) as ExportRow[]
}

async function loadOutcomePage(job: ExportJobRow, offset: number): Promise<ExportRow[]> {
  const admin = createAdminClient()
  let query = admin.schema('governance').from('governance_outcome_reports')
    .select('id,project_id,orchestrator_run_id,capability_run_id,schema_version,persona,depth,report_hash,report_payload,created_at')
    .eq('project_id', job.project_id)
    .lte('created_at', job.snapshot_at)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(offset, offset + job.chunk_size - 1)

  query = applyRange(query, 'created_at', job.filters)
  const persona = text(job.filters.persona)
  const depth = text(job.filters.depth)
  if (persona) query = query.eq('persona', persona)
  if (depth) query = query.eq('depth', depth)

  const { data, error } = await query
  if (error) throw new Error(`Unable to export governance outcome history: ${error.message}`)
  return (data ?? []) as ExportRow[]
}

async function loadExportPage(job: ExportJobRow, offset: number) {
  if (job.export_kind === 'AUDIT_EVENTS') return loadAuditPage(job, offset)
  if (job.export_kind === 'ANALYTICS_EVENTS') return loadAnalyticsPage(job, offset)
  return loadOutcomePage(job, offset)
}

function ndjson(rows: ExportRow[]) {
  return new TextEncoder().encode(rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''))
}

async function writeManifest(job: ExportJobRow, parts: ExportPart[], rowsExported: number) {
  const key = manifestKey(job.id)
  const manifest = {
    schemaVersion: '1.0',
    exportId: job.id,
    projectId: job.project_id,
    exportKind: job.export_kind,
    snapshotAt: job.snapshot_at,
    filters: job.filters,
    rowsExported,
    partCount: parts.length,
    parts,
    expiresAt: job.expires_at,
  }
  await getObjectStore().put({
    projectId: job.project_id,
    key,
    contentType: 'application/json',
    bytes: new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n'),
    metadata: {
      exportJobId: job.id,
      exportKind: job.export_kind,
      retentionUntil: job.expires_at,
      artifactRole: 'EXPORT_MANIFEST',
    },
  })
  return key
}

export async function executeHistoricalExportChunk(job: DurableJob) {
  const exportId = text(job.payload.exportJobId) || text(job.entity_id)
  if (!exportId) throw new Error('Durable export job payload is missing exportJobId.')

  const exportJob = await loadExportJob(exportId, job.project_id)
  if (!exportJob) throw new Error('Historical export job was not found in project.')
  if (exportJob.status === 'COMPLETED') return { exportId, status: 'COMPLETED', alreadyComplete: true }
  if (exportJob.status === 'FAILED') throw new Error('Historical export job is already FAILED.')

  const admin = createAdminClient()
  const now = new Date().toISOString()
  await admin.schema('orchestration').from('export_jobs').update({
    status: 'RUNNING',
    started_at: exportJob.started_at ?? now,
    last_error: null,
    updated_at: now,
  }).eq('id', exportJob.id).eq('project_id', exportJob.project_id)

  try {
    const offset = boundedOffset(exportJob.cursor_state)
    const rows = await loadExportPage(exportJob, offset)
    const existingParts = objectParts(exportJob.object_parts)

    if (rows.length === 0) {
      const manifest = await writeManifest(exportJob, existingParts, exportJob.rows_exported)
      await admin.schema('orchestration').from('export_jobs').update({
        status: 'COMPLETED',
        manifest_key: manifest,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', exportJob.id).eq('project_id', exportJob.project_id)
      await writeGovernanceAudit({
        projectId: exportJob.project_id,
        actorType: 'SYSTEM',
        eventType: 'HISTORICAL_EXPORT_COMPLETED',
        entityType: 'EXPORT_JOB',
        entityId: exportJob.id,
        metadata: {
          export_kind: exportJob.export_kind,
          rows_exported: exportJob.rows_exported,
          part_count: existingParts.length,
          manifest_key: manifest,
        },
      })
      return { exportId, status: 'COMPLETED', rowsExported: exportJob.rows_exported, partCount: existingParts.length }
    }

    const plan = planHistoricalExportChunk({
      offset,
      partCount: exportJob.part_count,
      rowsExported: exportJob.rows_exported,
      chunkSize: exportJob.chunk_size,
      rowCount: rows.length,
    })
    const partNumber = plan.partNumber
    if (partNumber === null) throw new Error('Historical export page planning returned no part for non-empty rows.')
    const key = exportKey(exportJob.id, partNumber)
    await getObjectStore().put({
      projectId: exportJob.project_id,
      key,
      contentType: 'application/x-ndjson',
      bytes: ndjson(rows),
      metadata: {
        exportJobId: exportJob.id,
        exportKind: exportJob.export_kind,
        partNumber: String(partNumber),
        rowCount: String(rows.length),
        retentionUntil: exportJob.expires_at,
        artifactRole: 'EXPORT_PART',
      },
    })

    const parts = [
      ...existingParts.filter((part) => part.part !== partNumber),
      { part: partNumber, key, rows: rows.length },
    ].sort((a, b) => a.part - b.part)
    const rowsExported = plan.nextRowsExported
    const nextOffset = plan.nextOffset
    const isComplete = plan.complete

    if (isComplete) {
      const manifest = await writeManifest(exportJob, parts, rowsExported)
      await admin.schema('orchestration').from('export_jobs').update({
        status: 'COMPLETED',
        cursor_state: { offset: nextOffset },
        object_parts: parts,
        manifest_key: manifest,
        part_count: parts.length,
        rows_exported: rowsExported,
        completed_at: new Date().toISOString(),
        last_error: null,
        updated_at: new Date().toISOString(),
      }).eq('id', exportJob.id).eq('project_id', exportJob.project_id)
      await writeGovernanceAudit({
        projectId: exportJob.project_id,
        actorType: 'SYSTEM',
        eventType: 'HISTORICAL_EXPORT_COMPLETED',
        entityType: 'EXPORT_JOB',
        entityId: exportJob.id,
        metadata: {
          export_kind: exportJob.export_kind,
          rows_exported: rowsExported,
          part_count: parts.length,
          manifest_key: manifest,
        },
      })
      return { exportId, status: 'COMPLETED', rowsExported, partCount: parts.length }
    }

    const { error: updateError } = await admin.schema('orchestration').from('export_jobs').update({
      status: 'RUNNING',
      cursor_state: { offset: nextOffset },
      object_parts: parts,
      part_count: parts.length,
      rows_exported: rowsExported,
      last_error: null,
      updated_at: new Date().toISOString(),
    }).eq('id', exportJob.id).eq('project_id', exportJob.project_id)
    if (updateError) throw new Error(`Unable to persist export cursor: ${updateError.message}`)

    await enqueueExportPart({ id: exportJob.id, project_id: exportJob.project_id, part_count: parts.length })
    return { exportId, status: 'RUNNING', rowsExported, partCount: parts.length, nextOffset }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    await admin.schema('orchestration').from('export_jobs').update({
      last_error: message.slice(0, 4000),
      updated_at: new Date().toISOString(),
    }).eq('id', exportJob.id).eq('project_id', exportJob.project_id)
    throw cause
  }
}

export async function markHistoricalExportFailed(job: DurableJob, cause: unknown) {
  const exportId = text(job.payload.exportJobId) || text(job.entity_id)
  if (!exportId) return
  const message = cause instanceof Error ? cause.message : String(cause)
  const admin = createAdminClient()
  await admin.schema('orchestration').from('export_jobs').update({
    status: 'FAILED',
    last_error: message.slice(0, 4000),
    completed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', exportId).eq('project_id', job.project_id).neq('status', 'COMPLETED')
}

export async function getHistoricalExportStatus(input: {
  projectId: string
  exportId: string
  signedUrls?: boolean
}) {
  const job = await loadExportJob(input.exportId, input.projectId)
  if (!job) return null
  if (!input.signedUrls || job.status !== 'COMPLETED') return job

  const store = getObjectStore()
  const parts = await Promise.all(job.object_parts.map(async (part) => ({
    ...part,
    signedUrl: await store.signedUrl({ projectId: job.project_id }, part.key, 300),
  })))
  const manifestSignedUrl = job.manifest_key
    ? await store.signedUrl({ projectId: job.project_id }, job.manifest_key, 300)
    : null

  return {
    ...job,
    object_parts: parts,
    manifest_signed_url: manifestSignedUrl,
  }
}
