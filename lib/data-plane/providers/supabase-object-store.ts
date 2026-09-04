import type {
  ObjectStore,
  ObjectStoreObject,
  ObjectStoreWriteRequest,
  TenantScope,
} from '@/lib/data-plane/contracts'
import { createAdminClient } from '@/lib/supabase/admin'

function bucketName() {
  return (process.env.SUPABASE_OBJECT_STORE_BUCKET ?? 'governance-artifacts').trim()
}

function scopedPath(scope: TenantScope, key: string) {
  const normalized = key.replaceAll('\\', '/').replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Object store key must be a normalized relative path without traversal segments')
  }
  return `projects/${scope.projectId}/${normalized}`
}

function boundedExpiry(value: number | undefined) {
  if (!Number.isFinite(value)) return 300
  return Math.max(30, Math.min(3600, Math.trunc(value as number)))
}

function retentionUntil(metadata: Record<string, string> | undefined) {
  const value = metadata?.retentionUntil?.trim()
  if (!value) return null
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error('Object retentionUntil metadata must be a valid ISO timestamp')
  return new Date(parsed).toISOString()
}

async function registerArtifact(request: ObjectStoreWriteRequest, contentType: string, size: number) {
  const admin = createAdminClient()
  const bucket = bucketName()
  const objectKey = scopedPath(request, request.key)
  const { error } = await admin.schema('orchestration').from('object_artifacts').upsert({
    project_id: request.projectId,
    provider_key: 'supabase',
    bucket,
    object_key: objectKey,
    content_type: contentType,
    size_bytes: size,
    retention_until: retentionUntil(request.metadata),
    lifecycle_status: 'ACTIVE',
    metadata: request.metadata ?? {},
    updated_at: new Date().toISOString(),
    deleted_at: null,
    last_error: null,
  }, { onConflict: 'project_id,provider_key,bucket,object_key' })
  if (error) throw new Error(`Unable to register object lifecycle state: ${error.message}`)
}

export class SupabaseObjectStore implements ObjectStore {
  readonly providerKey = 'supabase'

  async put(request: ObjectStoreWriteRequest): Promise<ObjectStoreObject> {
    const admin = createAdminClient()
    const path = scopedPath(request, request.key)
    const contentType = request.contentType ?? 'application/octet-stream'
    const { error } = await admin.storage
      .from(bucketName())
      .upload(path, Buffer.from(request.bytes), {
        contentType,
        upsert: true,
      })

    if (error) throw new Error(`Unable to store object: ${error.message}`)
    try {
      await registerArtifact(request, contentType, request.bytes.byteLength)
    } catch (registryError) {
      await admin.storage.from(bucketName()).remove([path]).catch(() => undefined)
      throw registryError
    }
    return {
      key: request.key,
      contentType,
      size: request.bytes.byteLength,
      metadata: request.metadata ?? {},
    }
  }

  async get(scope: TenantScope, key: string): Promise<Uint8Array | null> {
    const admin = createAdminClient()
    const { data, error } = await admin.storage.from(bucketName()).download(scopedPath(scope, key))
    if (error) {
      if (/not[ -]?found/i.test(error.message)) return null
      throw new Error(`Unable to load object: ${error.message}`)
    }
    return new Uint8Array(await data.arrayBuffer())
  }

  async signedUrl(scope: TenantScope, key: string, expiresInSeconds?: number): Promise<string> {
    const admin = createAdminClient()
    const expiresIn = boundedExpiry(expiresInSeconds)
    const { data, error } = await admin.storage
      .from(bucketName())
      .createSignedUrl(scopedPath(scope, key), expiresIn)
    if (error || !data?.signedUrl) {
      throw new Error(`Unable to create signed object URL: ${error?.message ?? 'signed URL was not returned'}`)
    }
    return data.signedUrl
  }

  async delete(scope: TenantScope, key: string): Promise<void> {
    const admin = createAdminClient()
    const bucket = bucketName()
    const objectKey = scopedPath(scope, key)
    const now = new Date().toISOString()
    await admin.schema('orchestration').from('object_artifacts').update({
      lifecycle_status: 'DELETING',
      updated_at: now,
      last_error: null,
    }).eq('project_id', scope.projectId).eq('provider_key', 'supabase').eq('bucket', bucket).eq('object_key', objectKey)

    const { error } = await admin.storage.from(bucket).remove([objectKey])
    if (error) {
      await admin.schema('orchestration').from('object_artifacts').update({
        lifecycle_status: 'FAILED',
        updated_at: new Date().toISOString(),
        last_error: error.message.slice(0, 4000),
      }).eq('project_id', scope.projectId).eq('provider_key', 'supabase').eq('bucket', bucket).eq('object_key', objectKey)
      throw new Error(`Unable to delete object: ${error.message}`)
    }

    await admin.schema('orchestration').from('object_artifacts').update({
      lifecycle_status: 'DELETED',
      updated_at: new Date().toISOString(),
      deleted_at: new Date().toISOString(),
      last_error: null,
    }).eq('project_id', scope.projectId).eq('provider_key', 'supabase').eq('bucket', bucket).eq('object_key', objectKey)
  }
}
