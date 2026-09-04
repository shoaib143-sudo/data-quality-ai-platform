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

export class SupabaseObjectStore implements ObjectStore {
  readonly providerKey = 'supabase'

  async put(request: ObjectStoreWriteRequest): Promise<ObjectStoreObject> {
    const admin = createAdminClient()
    const path = scopedPath(request, request.key)
    const { error } = await admin.storage
      .from(bucketName())
      .upload(path, Buffer.from(request.bytes), {
        contentType: request.contentType ?? 'application/octet-stream',
        upsert: true,
      })

    if (error) throw new Error(`Unable to store object: ${error.message}`)
    return {
      key: request.key,
      contentType: request.contentType ?? 'application/octet-stream',
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
    const { error } = await admin.storage.from(bucketName()).remove([scopedPath(scope, key)])
    if (error) throw new Error(`Unable to delete object: ${error.message}`)
  }
}
