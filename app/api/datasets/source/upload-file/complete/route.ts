import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { createObjectStorage } from '@/lib/storage/factory'
import type { StorageProvider, StorageReference } from '@/lib/storage/contracts'

function normalizedContentType(value?: string | null) {
  return (value ?? '').split(';', 1)[0].trim().toLowerCase()
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const projectId = typeof body.projectId === 'string' ? body.projectId.trim() : ''
    const storageObjectId = typeof body.storageObjectId === 'string' ? body.storageObjectId.trim() : ''
    if (!projectId || !storageObjectId) {
      return NextResponse.json({ error: 'projectId and storageObjectId are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'source.manage')
    const admin = createAdminClient()
    const { data: row, error: lookupError } = await admin
      .schema('catalog')
      .from('storage_objects')
      .select('id, project_id, provider, bucket, object_key, content_type, expected_size_bytes, size_bytes, state, metadata, verified_at')
      .eq('id', storageObjectId)
      .eq('project_id', projectId)
      .maybeSingle()

    if (lookupError) throw new Error(`Unable to load storage object: ${lookupError.message}`)
    if (!row) return NextResponse.json({ error: 'Storage object not found.' }, { status: 404 })
    if (row.state === 'DELETED') return NextResponse.json({ error: 'Storage object has been deleted.' }, { status: 409 })
    if (row.state === 'QUARANTINED') return NextResponse.json({ error: 'Storage object is quarantined.' }, { status: 409 })
    if (row.state === 'READY') {
      return NextResponse.json({
        ready: true,
        idempotent: true,
        storageObjectId: row.id,
        provider: row.provider,
        bucket: row.bucket,
        key: row.object_key,
        sizeBytes: row.size_bytes,
        verifiedAt: row.verified_at,
      })
    }

    const provider = row.provider as StorageProvider
    if (provider !== 'r2' && provider !== 'supabase') {
      throw new Error(`Unsupported storage provider in registry: ${row.provider}`)
    }
    const reference: StorageReference = {
      provider,
      bucket: row.bucket,
      key: row.object_key,
      contentType: row.content_type ?? undefined,
    }

    const { error: verifyingError } = await admin
      .schema('catalog')
      .from('storage_objects')
      .update({ state: 'VERIFYING', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('project_id', projectId)
      .neq('state', 'DELETED')
    if (verifyingError) throw new Error(`Unable to start object verification: ${verifyingError.message}`)

    const storage = createObjectStorage(provider)
    let head
    try {
      head = await storage.headObject(reference)
    } catch (headError) {
      await admin
        .schema('catalog')
        .from('storage_objects')
        .update({ state: 'FAILED', updated_at: new Date().toISOString(), metadata: { ...(row.metadata ?? {}), failure_stage: 'HEAD' } })
        .eq('id', row.id)
        .eq('project_id', projectId)
      throw headError
    }

    if (!head.exists) {
      await admin
        .schema('catalog')
        .from('storage_objects')
        .update({ state: 'FAILED', updated_at: new Date().toISOString(), metadata: { ...(row.metadata ?? {}), failure_stage: 'MISSING_OBJECT' } })
        .eq('id', row.id)
        .eq('project_id', projectId)
      return NextResponse.json({ error: 'Uploaded object was not found in storage.' }, { status: 409 })
    }

    const expectedSize = row.expected_size_bytes == null ? undefined : Number(row.expected_size_bytes)
    if (expectedSize !== undefined && head.sizeBytes !== undefined && head.sizeBytes !== expectedSize) {
      await admin
        .schema('catalog')
        .from('storage_objects')
        .update({
          state: 'QUARANTINED',
          size_bytes: head.sizeBytes,
          etag: head.etag ?? null,
          updated_at: new Date().toISOString(),
          metadata: { ...(row.metadata ?? {}), failure_stage: 'SIZE_MISMATCH', expected_size_bytes: expectedSize, observed_size_bytes: head.sizeBytes },
        })
        .eq('id', row.id)
        .eq('project_id', projectId)
      return NextResponse.json({ error: 'Uploaded object size does not match the authorized size.' }, { status: 409 })
    }

    const expectedType = normalizedContentType(row.content_type)
    const observedType = normalizedContentType(head.contentType)
    if (expectedType && observedType && expectedType !== observedType) {
      await admin
        .schema('catalog')
        .from('storage_objects')
        .update({
          state: 'QUARANTINED',
          size_bytes: head.sizeBytes ?? null,
          etag: head.etag ?? null,
          updated_at: new Date().toISOString(),
          metadata: { ...(row.metadata ?? {}), failure_stage: 'CONTENT_TYPE_MISMATCH', expected_content_type: expectedType, observed_content_type: observedType },
        })
        .eq('id', row.id)
        .eq('project_id', projectId)
      return NextResponse.json({ error: 'Uploaded object content type does not match the authorized content type.' }, { status: 409 })
    }

    const verifiedAt = new Date().toISOString()
    const { error: readyError } = await admin
      .schema('catalog')
      .from('storage_objects')
      .update({
        state: 'READY',
        size_bytes: head.sizeBytes ?? expectedSize ?? null,
        etag: head.etag ?? null,
        verified_at: verifiedAt,
        updated_at: verifiedAt,
        metadata: { ...(row.metadata ?? {}), verification: 'HEAD_SIZE_CONTENT_TYPE' },
      })
      .eq('id', row.id)
      .eq('project_id', projectId)
      .eq('state', 'VERIFYING')
    if (readyError) throw new Error(`Unable to mark storage object ready: ${readyError.message}`)

    return NextResponse.json({
      ready: true,
      storageObjectId: row.id,
      provider,
      bucket: row.bucket,
      key: row.object_key,
      sizeBytes: head.sizeBytes ?? expectedSize,
      contentType: head.contentType ?? row.content_type,
      verifiedAt,
      sourceUri: `${provider}://${row.bucket}/${row.object_key}`,
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Dataset upload verification failed.' }, { status: 500 })
  }
}
