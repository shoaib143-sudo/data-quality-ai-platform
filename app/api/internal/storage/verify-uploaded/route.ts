import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireInternalBearer } from '@/lib/security/internal-bearer'
import { createObjectStorage } from '@/lib/storage/factory'
import type { StorageProvider, StorageReference } from '@/lib/storage/contracts'

// requireInternalBearer validates the CRON_SECRET using constant-time comparison.
export const dynamic = 'force-dynamic'

const DEFAULT_BATCH = 25
const MAX_BATCH = 100

function normalizedContentType(value?: string | null) {
  return (value ?? '').split(';', 1)[0].trim().toLowerCase()
}

function batchSize() {
  const parsed = Number(process.env.STORAGE_VERIFY_BATCH_SIZE)
  return Number.isFinite(parsed) ? Math.min(MAX_BATCH, Math.max(1, Math.floor(parsed))) : DEFAULT_BATCH
}

export async function POST(request: Request) {
  if (!requireInternalBearer(request)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: rows, error } = await admin
    .schema('catalog')
    .from('storage_objects')
    .select('id, project_id, provider, bucket, object_key, content_type, expected_size_bytes, state, metadata')
    .eq('state', 'UPLOADED')
    .eq('owner_type', 'LEGACY_UPLOAD')
    .order('created_at', { ascending: true })
    .limit(batchSize())

  if (error) {
    return NextResponse.json({ error: `Unable to load uploaded storage objects: ${error.message}` }, { status: 500 })
  }

  const results: Array<Record<string, unknown>> = []
  for (const row of rows ?? []) {
    const provider = row.provider as StorageProvider
    if (provider !== 'r2' && provider !== 'supabase') {
      results.push({ id: row.id, action: 'SKIPPED', reason: 'UNSUPPORTED_PROVIDER' })
      continue
    }

    const reference: StorageReference = {
      provider,
      bucket: row.bucket,
      key: row.object_key,
      contentType: row.content_type ?? undefined,
    }
    const metadata = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {}
    const now = new Date().toISOString()

    try {
      const head = await createObjectStorage(provider).headObject(reference)
      if (!head.exists) {
        const { error: updateError } = await admin
          .schema('catalog')
          .from('storage_objects')
          .update({
            state: 'FAILED',
            updated_at: now,
            metadata: { ...metadata, verification: 'MISSING_OBJECT', verified_attempt_at: now },
          })
          .eq('id', row.id)
          .eq('project_id', row.project_id)
          .eq('state', 'UPLOADED')
        if (updateError) throw new Error(updateError.message)
        results.push({ id: row.id, action: 'FAILED_MISSING_OBJECT' })
        continue
      }

      const expectedSize = row.expected_size_bytes == null ? undefined : Number(row.expected_size_bytes)
      if (expectedSize !== undefined && head.sizeBytes === undefined) {
        const { error: updateError } = await admin
          .schema('catalog')
          .from('storage_objects')
          .update({
            state: 'FAILED',
            etag: head.etag ?? null,
            updated_at: now,
            metadata: { ...metadata, verification: 'SIZE_UNVERIFIABLE', expected_size_bytes: expectedSize, verified_attempt_at: now },
          })
          .eq('id', row.id)
          .eq('project_id', row.project_id)
          .eq('state', 'UPLOADED')
        if (updateError) throw new Error(updateError.message)
        results.push({ id: row.id, action: 'FAILED_SIZE_UNVERIFIABLE' })
        continue
      }

      if (expectedSize !== undefined && head.sizeBytes !== expectedSize) {
        const { error: updateError } = await admin
          .schema('catalog')
          .from('storage_objects')
          .update({
            state: 'QUARANTINED',
            size_bytes: head.sizeBytes ?? null,
            etag: head.etag ?? null,
            updated_at: now,
            metadata: {
              ...metadata,
              verification: 'SIZE_MISMATCH',
              expected_size_bytes: expectedSize,
              observed_size_bytes: head.sizeBytes,
              verified_attempt_at: now,
            },
          })
          .eq('id', row.id)
          .eq('project_id', row.project_id)
          .eq('state', 'UPLOADED')
        if (updateError) throw new Error(updateError.message)
        results.push({ id: row.id, action: 'QUARANTINED_SIZE_MISMATCH' })
        continue
      }

      const expectedType = normalizedContentType(row.content_type)
      const observedType = normalizedContentType(head.contentType)
      if (expectedType && !observedType) {
        const { error: updateError } = await admin
          .schema('catalog')
          .from('storage_objects')
          .update({
            state: 'FAILED',
            size_bytes: head.sizeBytes ?? null,
            etag: head.etag ?? null,
            updated_at: now,
            metadata: { ...metadata, verification: 'CONTENT_TYPE_UNVERIFIABLE', expected_content_type: expectedType, verified_attempt_at: now },
          })
          .eq('id', row.id)
          .eq('project_id', row.project_id)
          .eq('state', 'UPLOADED')
        if (updateError) throw new Error(updateError.message)
        results.push({ id: row.id, action: 'FAILED_CONTENT_TYPE_UNVERIFIABLE' })
        continue
      }

      if (expectedType && observedType !== expectedType) {
        const { error: updateError } = await admin
          .schema('catalog')
          .from('storage_objects')
          .update({
            state: 'QUARANTINED',
            size_bytes: head.sizeBytes ?? null,
            etag: head.etag ?? null,
            updated_at: now,
            metadata: {
              ...metadata,
              verification: 'CONTENT_TYPE_MISMATCH',
              expected_content_type: expectedType,
              observed_content_type: observedType,
              verified_attempt_at: now,
            },
          })
          .eq('id', row.id)
          .eq('project_id', row.project_id)
          .eq('state', 'UPLOADED')
        if (updateError) throw new Error(updateError.message)
        results.push({ id: row.id, action: 'QUARANTINED_CONTENT_TYPE_MISMATCH' })
        continue
      }

      const { error: readyError } = await admin
        .schema('catalog')
        .from('storage_objects')
        .update({
          state: 'READY',
          size_bytes: head.sizeBytes ?? null,
          etag: head.etag ?? null,
          verified_at: now,
          updated_at: now,
          metadata: { ...metadata, verification: 'HEAD_SIZE_CONTENT_TYPE', requires_verification: false, verified_attempt_at: now },
        })
        .eq('id', row.id)
        .eq('project_id', row.project_id)
        .eq('state', 'UPLOADED')
      if (readyError) throw new Error(readyError.message)
      results.push({ id: row.id, action: 'READY' })
    } catch (verificationError) {
      results.push({ id: row.id, action: 'ERROR', error: verificationError instanceof Error ? verificationError.message : 'verification failed' })
    }
  }

  return NextResponse.json({
    examined: rows?.length ?? 0,
    results,
    destructiveActions: 0,
  })
}
