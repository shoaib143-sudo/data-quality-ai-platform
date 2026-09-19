import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { createObjectStorage } from '@/lib/storage/factory'
import type { MultipartObjectStorage, MultipartUploadPart } from '@/lib/storage/contracts'

const SIGNED_PART_TTL_SECONDS = 15 * 60

type MultipartRegistryRow = {
  id: string
  project_id: string
  provider: string
  bucket: string
  object_key: string
  state: string
  metadata: Record<string, unknown> | null
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function multipartMetadata(row: MultipartRegistryRow) {
  const metadata = row.metadata ?? {}
  const uploadId = text(metadata.multipart_upload_id)
  const partCount = Number(metadata.multipart_part_count)
  const uploadMode = text(metadata.upload_mode)
  if (row.provider !== 'r2'
    || uploadMode !== 'MULTIPART'
    || !uploadId
    || !Number.isInteger(partCount)
    || partCount < 1
    || partCount > 10_000) {
    throw new Error('Storage object is not a valid R2 multipart upload.')
  }
  return { metadata, uploadId, partCount }
}

async function loadMultipartObject(projectId: string, storageObjectId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin
    .schema('catalog')
    .from('storage_objects')
    .select('id, project_id, provider, bucket, object_key, state, metadata')
    .eq('id', storageObjectId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw new Error(`Unable to load multipart storage object: ${error.message}`)
  if (!data) return null
  return { admin, row: data as MultipartRegistryRow }
}

function multipartStorage() {
  return createObjectStorage('r2') as MultipartObjectStorage
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const storageObjectId = text(body.storageObjectId)
    const action = text(body.action).toLowerCase()

    if (!projectId || !storageObjectId || !action) {
      return NextResponse.json({ error: 'projectId, storageObjectId, and action are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'source.manage')
    const loaded = await loadMultipartObject(projectId, storageObjectId)
    if (!loaded) return NextResponse.json({ error: 'Storage object not found.' }, { status: 404 })
    const { admin, row } = loaded
    const { metadata, uploadId, partCount } = multipartMetadata(row)

    if (action === 'authorize-part') {
      if (row.state !== 'UPLOADING') {
        return NextResponse.json({ error: 'Multipart part authorization requires an UPLOADING object.' }, { status: 409 })
      }
      const partNumber = Number(body.partNumber)
      if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > partCount) {
        return NextResponse.json({ error: `partNumber must be between 1 and ${partCount}.` }, { status: 400 })
      }

      const authorization = await multipartStorage().createMultipartPartAuthorization({
        bucket: row.bucket,
        key: row.object_key,
        uploadId,
        partNumber,
        expiresInSeconds: SIGNED_PART_TTL_SECONDS,
      })
      return NextResponse.json({
        storageObjectId: row.id,
        provider: 'r2',
        partNumber,
        uploadUrl: authorization.url,
        uploadHeaders: authorization.requiredHeaders,
        expiresAt: authorization.expiresAt,
      })
    }

    if (action === 'complete') {
      if (row.state === 'UPLOADED' || row.state === 'VERIFYING' || row.state === 'READY') {
        return NextResponse.json({
          completed: true,
          idempotent: true,
          storageObjectId: row.id,
          verificationEndpoint: '/api/datasets/source/upload-file/complete',
        })
      }
      if (row.state !== 'UPLOADING') {
        return NextResponse.json({ error: 'Multipart completion requires an UPLOADING object.' }, { status: 409 })
      }
      const rawParts = Array.isArray(body.parts) ? body.parts : []
      if (rawParts.length !== partCount) {
        return NextResponse.json({ error: `Multipart completion requires exactly ${partCount} parts.` }, { status: 400 })
      }
      const parts: MultipartUploadPart[] = rawParts.map((value: unknown) => {
        const part = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
        return { partNumber: Number(part.partNumber), etag: text(part.etag) }
      })

      const storage = multipartStorage()
      const existing = await storage.headObject({
        provider: 'r2',
        bucket: row.bucket,
        key: row.object_key,
      })
      const recoveredCompletedObject = existing.exists
      if (!recoveredCompletedObject) {
        await storage.completeMultipartUpload({
          bucket: row.bucket,
          key: row.object_key,
          uploadId,
          parts,
        })
      }

      const now = new Date().toISOString()
      const { error: updateError } = await admin
        .schema('catalog')
        .from('storage_objects')
        .update({
          state: 'UPLOADED',
          updated_at: now,
          metadata: {
            ...metadata,
            multipart_completed_at: now,
            multipart_completed_parts: partCount,
            multipart_completion_recovered: recoveredCompletedObject,
          },
        })
        .eq('id', row.id)
        .eq('project_id', projectId)
        .eq('state', 'UPLOADING')
      if (updateError) {
        throw new Error(`Multipart object completed but registry update failed: ${updateError.message}`)
      }

      return NextResponse.json({
        completed: true,
        storageObjectId: row.id,
        provider: 'r2',
        partCount,
        idempotent: recoveredCompletedObject,
        verificationEndpoint: '/api/datasets/source/upload-file/complete',
      })
    }

    return NextResponse.json({ error: 'Unsupported multipart upload action.' }, { status: 400 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Multipart upload operation failed.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = text(body.projectId)
    const storageObjectId = text(body.storageObjectId)
    if (!projectId || !storageObjectId) {
      return NextResponse.json({ error: 'projectId and storageObjectId are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'source.manage')
    const loaded = await loadMultipartObject(projectId, storageObjectId)
    if (!loaded) return NextResponse.json({ error: 'Storage object not found.' }, { status: 404 })
    const { admin, row } = loaded
    const { metadata, uploadId } = multipartMetadata(row)

    if (row.state === 'READY' || row.state === 'DELETED') {
      return NextResponse.json({ error: 'Completed or deleted storage objects cannot be aborted as multipart uploads.' }, { status: 409 })
    }
    if (text(metadata.multipart_aborted_at)) {
      return NextResponse.json({ aborted: true, idempotent: true, storageObjectId: row.id })
    }

    const storage = multipartStorage()
    const existing = await storage.headObject({
      provider: 'r2',
      bucket: row.bucket,
      key: row.object_key,
    })
    if (existing.exists) {
      return NextResponse.json({ error: 'Multipart upload has already produced a completed object and cannot be aborted.' }, { status: 409 })
    }

    await storage.abortMultipartUpload({
      bucket: row.bucket,
      key: row.object_key,
      uploadId,
    })

    const now = new Date().toISOString()
    const { error: updateError } = await admin
      .schema('catalog')
      .from('storage_objects')
      .update({
        state: 'FAILED',
        updated_at: now,
        metadata: {
          ...metadata,
          multipart_aborted_at: now,
          failure_stage: 'MULTIPART_ABORTED',
        },
      })
      .eq('id', row.id)
      .eq('project_id', projectId)
      .neq('state', 'READY')
      .neq('state', 'DELETED')
    if (updateError) throw new Error(`Multipart abort succeeded but registry update failed: ${updateError.message}`)

    return NextResponse.json({ aborted: true, storageObjectId: row.id })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Multipart upload abort failed.' }, { status: 500 })
  }
}
