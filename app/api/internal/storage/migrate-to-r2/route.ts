import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireInternalAutomation } from '@/lib/security/internal-bearer'
import { createObjectStorage } from '@/lib/storage/factory'
import type { StorageReference } from '@/lib/storage/contracts'

// requireInternalBearer validates CRON_SECRET using constant-time comparison.
export const dynamic = 'force-dynamic'

const DEFAULT_BATCH = 5
const MAX_BATCH = 20
const DEFAULT_MAX_OBJECT_BYTES = 250 * 1024 * 1024
const HARD_MAX_OBJECT_BYTES = 1024 * 1024 * 1024
const SOURCE_SCAN_PAGE_SIZE = 100
const MAX_SOURCE_SCAN_ROWS = 1000

type SourceRow = {
  id: string
  project_id: string
  bucket: string
  object_key: string
  object_type: string
  original_filename: string | null
  content_type: string | null
  size_bytes: number | null
  checksum: string | null
  checksum_algorithm: string | null
  verified_at: string | null
}

type TargetRow = {
  id: string
  state: string
  metadata: Record<string, unknown> | null
}

function batchSize() {
  const parsed = Number(process.env.STORAGE_MIGRATION_BATCH_SIZE)
  return Number.isFinite(parsed) ? Math.min(MAX_BATCH, Math.max(1, Math.floor(parsed))) : DEFAULT_BATCH
}

function maxObjectBytes() {
  const parsed = Number(process.env.STORAGE_MIGRATION_MAX_OBJECT_BYTES)
  return Number.isFinite(parsed)
    ? Math.min(HARD_MAX_OBJECT_BYTES, Math.max(1024 * 1024, Math.floor(parsed)))
    : DEFAULT_MAX_OBJECT_BYTES
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required migration configuration: ${name}`)
  return value
}

function r2Prefix() {
  return required('R2_PREFIX').replace(/^\/+|\/+$/g, '')
}

function targetKey(source: SourceRow) {
  return `projects/${source.project_id}/migrations/supabase/${source.id}`
}

function persistedR2Key(key: string) {
  return `${r2Prefix()}/${key}`
}

function sha256(bytes: ArrayBuffer) {
  return createHash('sha256').update(Buffer.from(bytes)).digest('hex')
}

function normalizedContentType(value?: string | null) {
  return (value ?? '').split(';', 1)[0].trim().toLowerCase()
}

async function targetChecksum(storage: ReturnType<typeof createObjectStorage>, reference: StorageReference) {
  const response = await storage.getObject(reference)
  const bytes = await response.arrayBuffer()
  return { checksum: sha256(bytes), sizeBytes: bytes.byteLength }
}

async function persistVerifiedSourceChecksum(
  admin: ReturnType<typeof createAdminClient>,
  source: SourceRow,
  checksum: string,
) {
  if (source.checksum_algorithm === 'sha256' && source.checksum === checksum) return
  if (source.checksum && source.checksum !== checksum) {
    throw new Error('Supabase source checksum changed before migration persistence.')
  }
  if (source.checksum_algorithm && source.checksum_algorithm !== 'sha256') {
    throw new Error('Supabase source uses an unsupported checksum algorithm.')
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await admin
    .schema('catalog')
    .from('storage_objects')
    .update({ checksum_algorithm: 'sha256', checksum, updated_at: now })
    .eq('id', source.id)
    .eq('provider', 'supabase')
    .eq('state', 'READY')
    .is('checksum', null)
    .select('checksum, checksum_algorithm')
    .maybeSingle()
  if (updateError) throw new Error(`Unable to persist verified source checksum: ${updateError.message}`)
  if (updated) {
    source.checksum = updated.checksum
    source.checksum_algorithm = updated.checksum_algorithm
    return
  }

  const { data: current, error: currentError } = await admin
    .schema('catalog')
    .from('storage_objects')
    .select('state, checksum, checksum_algorithm')
    .eq('id', source.id)
    .eq('provider', 'supabase')
    .maybeSingle()
  if (currentError || !current) throw new Error(`Unable to confirm persisted source checksum: ${currentError?.message ?? 'missing source'}`)
  if (current.state !== 'READY' || current.checksum_algorithm !== 'sha256' || current.checksum !== checksum) {
    throw new Error('Supabase source checksum changed concurrently during migration verification.')
  }
  source.checksum = current.checksum
  source.checksum_algorithm = current.checksum_algorithm
}

export async function POST(request: Request) {
  if (!(await requireInternalAutomation(request))) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const r2Bucket = required('R2_BUCKET')
  required('R2_ACCOUNT_ID')
  required('R2_ACCESS_KEY_ID')
  required('R2_SECRET_ACCESS_KEY')
  required('R2_ENDPOINT')
  const admin = createAdminClient()
  const sourceStorage = createObjectStorage('supabase')
  const targetStorage = createObjectStorage('r2')
  const objectLimit = maxObjectBytes()

  const candidates: SourceRow[] = []
  let examined = 0
  for (let offset = 0; offset < MAX_SOURCE_SCAN_ROWS && candidates.length < batchSize(); offset += SOURCE_SCAN_PAGE_SIZE) {
    const { data: sourcePage, error: sourceError } = await admin
      .schema('catalog')
      .from('storage_objects')
      .select('id, project_id, bucket, object_key, object_type, original_filename, content_type, size_bytes, checksum, checksum_algorithm, verified_at')
      .eq('provider', 'supabase')
      .eq('state', 'READY')
      .not('size_bytes', 'is', null)
      .not('verified_at', 'is', null)
      .lte('size_bytes', objectLimit)
      .or('and(checksum.is.null,checksum_algorithm.is.null),checksum_algorithm.eq.sha256')
      .order('created_at', { ascending: true })
      .range(offset, offset + SOURCE_SCAN_PAGE_SIZE - 1)

    if (sourceError) {
      return NextResponse.json({ error: `Unable to load verified Supabase source objects: ${sourceError.message}` }, { status: 500 })
    }

    const rows = (sourcePage ?? []) as SourceRow[]
    examined += rows.length
    for (const source of rows) {
      const key = targetKey(source)
      const persistedKey = persistedR2Key(key)
      const { data: readyTarget, error: readyTargetError } = await admin
        .schema('catalog')
        .from('storage_objects')
        .select('id')
        .eq('provider', 'r2')
        .eq('bucket', r2Bucket)
        .eq('object_key', persistedKey)
        .eq('state', 'READY')
        .maybeSingle()
      if (readyTargetError) {
        return NextResponse.json({ error: `Unable to inspect R2 migration targets: ${readyTargetError.message}` }, { status: 500 })
      }
      if (!readyTarget) candidates.push(source)
      if (candidates.length >= batchSize()) break
    }
    if (rows.length < SOURCE_SCAN_PAGE_SIZE) break
  }

  const results: Array<Record<string, unknown>> = []
  for (const source of candidates) {
    const key = targetKey(source)
    const persistedKey = persistedR2Key(key)

    const { data: existingTarget, error: existingError } = await admin
      .schema('catalog')
      .from('storage_objects')
      .select('id, state, metadata')
      .eq('provider', 'r2')
      .eq('bucket', r2Bucket)
      .eq('object_key', persistedKey)
      .maybeSingle()
    if (existingError) {
      results.push({ sourceStorageObjectId: source.id, action: 'ERROR', error: existingError.message })
      continue
    }

    if (existingTarget?.state === 'READY') {
      results.push({ sourceStorageObjectId: source.id, targetStorageObjectId: existingTarget.id, action: 'SKIPPED_ALREADY_READY' })
      continue
    }

    if (source.size_bytes == null || !source.verified_at) {
      results.push({ sourceStorageObjectId: source.id, action: 'SKIPPED_SOURCE_NOT_INTEGRITY_READY' })
      continue
    }
    if (source.checksum && source.checksum_algorithm !== 'sha256') {
      results.push({ sourceStorageObjectId: source.id, action: 'SKIPPED_SOURCE_UNSUPPORTED_CHECKSUM' })
      continue
    }
    if (Number(source.size_bytes) > objectLimit) {
      results.push({ sourceStorageObjectId: source.id, action: 'SKIPPED_OBJECT_TOO_LARGE', sizeBytes: Number(source.size_bytes), limitBytes: objectLimit })
      continue
    }

    let target = existingTarget as TargetRow | null
    if (!target) {
      const { data: inserted, error: insertError } = await admin
        .schema('catalog')
        .from('storage_objects')
        .insert({
          project_id: source.project_id,
          provider: 'r2',
          bucket: r2Bucket,
          object_key: persistedKey,
          object_type: source.object_type,
          owner_type: 'MIGRATION_COPY',
          original_filename: source.original_filename,
          content_type: source.content_type,
          expected_size_bytes: Number(source.size_bytes),
          checksum_algorithm: 'sha256',
          state: 'PENDING',
          metadata: {
            migration_source_provider: 'supabase',
            source_storage_object_id: source.id,
            source_bucket: source.bucket,
            source_object_key_hash: createHash('sha256').update(source.object_key).digest('hex'),
          },
        })
        .select('id, state, metadata')
        .single()

      if (insertError || !inserted) {
        const { data: racedTarget } = await admin
          .schema('catalog')
          .from('storage_objects')
          .select('id, state, metadata')
          .eq('provider', 'r2')
          .eq('bucket', r2Bucket)
          .eq('object_key', persistedKey)
          .maybeSingle()
        if (!racedTarget) {
          results.push({ sourceStorageObjectId: source.id, action: 'ERROR', error: insertError?.message ?? 'Unable to register R2 migration target.' })
          continue
        }
        target = racedTarget as TargetRow
      } else {
        target = inserted as TargetRow
      }
    }

    if (!target || target.state === 'DELETED') {
      results.push({ sourceStorageObjectId: source.id, targetStorageObjectId: target?.id, action: 'SKIPPED_TARGET_DELETED' })
      continue
    }

    try {
      const sourceReference: StorageReference = {
        provider: 'supabase',
        bucket: source.bucket,
        key: source.object_key,
        contentType: source.content_type ?? undefined,
      }
      const sourceHead = await sourceStorage.headObject(sourceReference)
      if (!sourceHead.exists || sourceHead.sizeBytes !== Number(source.size_bytes)) {
        throw new Error('Verified Supabase source no longer matches its registry size.')
      }
      const sourceObservedType = normalizedContentType(sourceHead.contentType)
      const sourceExpectedType = normalizedContentType(source.content_type)
      if (sourceExpectedType && !sourceObservedType) {
        throw new Error('Verified Supabase source content type can no longer be observed.')
      }
      if (sourceExpectedType && sourceExpectedType !== sourceObservedType) {
        throw new Error('Verified Supabase source content type no longer matches its registry metadata.')
      }

      const sourceResponse = await sourceStorage.getObject(sourceReference)
      const bytes = await sourceResponse.arrayBuffer()
      if (bytes.byteLength !== Number(source.size_bytes)) {
        throw new Error('Supabase source bytes do not match verified registry size.')
      }
      const checksum = sha256(bytes)
      if (source.checksum_algorithm === 'sha256' && source.checksum && source.checksum !== checksum) {
        throw new Error('Supabase source bytes do not match verified registry checksum.')
      }
      await persistVerifiedSourceChecksum(admin, source, checksum)

      const { error: copyingError } = await admin
        .schema('catalog')
        .from('storage_objects')
        .update({ state: 'VERIFYING', updated_at: new Date().toISOString() })
        .eq('id', target.id)
        .in('state', ['PENDING', 'FAILED', 'UPLOADED', 'VERIFYING'])
      if (copyingError) throw new Error(`Unable to enter R2 migration verification state: ${copyingError.message}`)

      const written = await targetStorage.putObject({
        bucket: r2Bucket,
        key,
        body: bytes,
        contentType: source.content_type ?? undefined,
        checksum,
      })
      const head = await targetStorage.headObject(written)
      if (!head.exists || head.sizeBytes !== bytes.byteLength) {
        throw new Error('R2 migration target failed size verification.')
      }
      const expectedType = normalizedContentType(source.content_type)
      const observedType = normalizedContentType(head.contentType)
      if (expectedType && (!observedType || expectedType !== observedType)) {
        throw new Error('R2 migration target failed content-type verification.')
      }

      const targetDigest = await targetChecksum(targetStorage, written)
      if (targetDigest.sizeBytes !== bytes.byteLength || targetDigest.checksum !== checksum) {
        const { error: quarantineError } = await admin
          .schema('catalog')
          .from('storage_objects')
          .update({
            state: 'QUARANTINED',
            size_bytes: targetDigest.sizeBytes,
            checksum_algorithm: 'sha256',
            checksum: targetDigest.checksum,
            etag: head.etag ?? null,
            updated_at: new Date().toISOString(),
            metadata: { ...(target.metadata ?? {}), migration_verification: 'SHA256_MISMATCH' },
          })
          .eq('id', target.id)
        if (quarantineError) throw new Error(`R2 checksum mismatch and quarantine failed: ${quarantineError.message}`)
        results.push({ sourceStorageObjectId: source.id, targetStorageObjectId: target.id, action: 'QUARANTINED_CHECKSUM_MISMATCH' })
        continue
      }

      const verifiedAt = new Date().toISOString()
      const { error: readyError } = await admin
        .schema('catalog')
        .from('storage_objects')
        .update({
          state: 'READY',
          size_bytes: bytes.byteLength,
          checksum_algorithm: 'sha256',
          checksum,
          etag: head.etag ?? null,
          verified_at: verifiedAt,
          updated_at: verifiedAt,
          metadata: {
            ...(target.metadata ?? {}),
            migration_verification: 'SOURCE_HEAD_SOURCE_SHA256_TARGET_HEAD_TARGET_SHA256',
            source_storage_object_id: source.id,
            copied_at: verifiedAt,
          },
        })
        .eq('id', target.id)
        .eq('state', 'VERIFYING')
      if (readyError) throw new Error(`Unable to mark R2 migration target READY: ${readyError.message}`)

      results.push({
        sourceStorageObjectId: source.id,
        targetStorageObjectId: target.id,
        action: 'COPIED_AND_VERIFIED',
        sizeBytes: bytes.byteLength,
        checksumAlgorithm: 'sha256',
        sourceChecksumPersisted: true,
      })
    } catch (migrationError) {
      const failedAt = new Date().toISOString()
      await admin
        .schema('catalog')
        .from('storage_objects')
        .update({
          state: 'FAILED',
          updated_at: failedAt,
          metadata: {
            ...(target.metadata ?? {}),
            migration_failure: migrationError instanceof Error ? migrationError.message : 'R2 migration failed',
            failed_at: failedAt,
          },
        })
        .eq('id', target.id)
        .neq('state', 'READY')
        .neq('state', 'QUARANTINED')
      results.push({
        sourceStorageObjectId: source.id,
        targetStorageObjectId: target.id,
        action: 'ERROR',
        error: migrationError instanceof Error ? migrationError.message : 'R2 migration failed',
      })
    }
  }

  return NextResponse.json({
    examined,
    selected: candidates.length,
    results,
    sourceObjectsDeleted: 0,
    datasetVersionReferencesChanged: 0,
  })
}
