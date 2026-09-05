import type { SupabaseClient } from '@supabase/supabase-js'
import { safeRemoteFileFetch } from '@/lib/profiling/safe-remote-file'

export type FileMetadataLocation = {
  sourceUri: string
  executionConfig: Record<string, unknown>
}

export type FileMetadataDiscoveryResult = {
  asset: {
    asset_type: string
    namespace: string | null
    name: string
    columns: unknown[]
    metadata: Record<string, unknown>
  }
  snapshot: Record<string, unknown>
}

function stringField(source: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = source[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function sourceName(value: string) {
  const clean = value.split('?')[0].replace(/\/$/, '')
  return decodeURIComponent(clean.split('/').pop() || 'file')
}

async function remoteMetadata(url: string) {
  let response = await safeRemoteFileFetch(url, { method: 'HEAD', cache: 'no-store' })
  if ([405, 501].includes(response.status)) {
    response = await safeRemoteFileFetch(url, { method: 'GET', headers: { range: 'bytes=0-0' }, cache: 'no-store' })
  }
  if (!response.ok && response.status !== 206) throw new Error(`Unable to inspect FILE source metadata: HTTP ${response.status} ${response.statusText}`)
  await response.body?.cancel().catch(() => undefined)
  const length = Number(response.headers.get('content-length'))
  const contentRange = response.headers.get('content-range')
  const rangeTotal = contentRange?.match(/\/(\d+)$/)?.[1]
  const size = rangeTotal ? Number(rangeTotal) : Number.isFinite(length) ? length : null
  return {
    name: sourceName(url),
    source_uri: url,
    content_type: response.headers.get('content-type'),
    size_bytes: Number.isFinite(size) ? size : null,
    etag: response.headers.get('etag'),
    last_modified: response.headers.get('last-modified'),
    metadata_method: response.status === 206 ? 'HTTP_RANGE_METADATA' : 'HTTP_HEAD',
  }
}

async function storageMetadata(admin: SupabaseClient, sourceUri: string, executionConfig: Record<string, unknown>) {
  const bucket = stringField(executionConfig, ['bucket', 'bucket_id', 'bucketId', 'storage_bucket', 'storageBucket'])
  const rawPath = stringField(executionConfig, ['path', 'storage_path', 'storagePath', 'object_path', 'objectPath'])
    ?? sourceUri.replace(/^storage:\/\//i, '').split('/').slice(1).join('/')
  const uriBucket = sourceUri.replace(/^storage:\/\//i, '').split('/')[0]
  const resolvedBucket = bucket || uriBucket
  if (!resolvedBucket || !rawPath) throw new Error('FILE source storage metadata requires bucket and object path.')
  const normalized = rawPath.replace(/^\/+/, '').replace(/\/+$/, '')
  const parts = normalized.split('/')
  const name = parts.pop()!
  const folder = parts.join('/')
  const { data, error } = await admin.storage.from(resolvedBucket).list(folder, { limit: 100, search: name })
  if (error) throw new Error(`Unable to inspect storage object metadata: ${error.message}`)
  const item = (data ?? []).find(candidate => candidate.name === name)
  if (!item) throw new Error(`Storage object metadata was not found for ${resolvedBucket}/${normalized}.`)
  const metadata = item.metadata && typeof item.metadata === 'object' ? item.metadata as Record<string, unknown> : {}
  return {
    name,
    source_uri: `storage://${resolvedBucket}/${normalized}`,
    bucket: resolvedBucket,
    path: normalized,
    content_type: stringField(metadata, ['mimetype', 'contentType', 'content_type']),
    size_bytes: typeof metadata.size === 'number' ? metadata.size : Number(metadata.size) || null,
    etag: stringField(metadata, ['eTag', 'etag']),
    last_modified: item.updated_at ?? item.created_at ?? null,
    metadata_method: 'SUPABASE_STORAGE_LIST',
    storage_metadata: metadata,
  }
}

export async function discoverFileMetadata(
  admin: SupabaseClient,
  location: FileMetadataLocation,
  sourceType: string,
): Promise<FileMetadataDiscoveryResult> {
  const executionConfig = location.executionConfig ?? {}
  const explicitUrl = stringField(executionConfig, ['url', 'source_url', 'sourceUrl'])
  const url = explicitUrl ?? (/^https?:\/\//i.test(location.sourceUri) ? location.sourceUri : null)
  const metadata = url
    ? await remoteMetadata(url)
    : await storageMetadata(admin, location.sourceUri, executionConfig)

  const asset = {
    asset_type: sourceType.toUpperCase() === 'CSV' ? 'FILE' : 'FILE_METADATA',
    namespace: null,
    name: metadata.name,
    columns: [] as unknown[],
    metadata: {
      ...metadata,
      source_type: sourceType,
      discovery_content_access: 'METADATA_ONLY',
      schema_inference_status: 'DEFERRED_TO_PROFILING',
      native_qualified_name: metadata.source_uri,
      native_identity: metadata.etag
        ? { provider: 'FILE', kind: 'OBJECT', id: `${metadata.source_uri}:${metadata.etag}`, immutable: true }
        : null,
    },
  }
  const manifest = {
    expected_object_count: 1,
    expected_field_count: 0,
    observed_object_count: 1,
    observed_field_count: 0,
    failed_item_count: 0,
    truncated: false,
    complete: true,
    consistency_mode: 'BEST_EFFORT_RECONCILIATION',
  }
  return {
    asset,
    snapshot: {
      source_type: sourceType,
      source_uri: metadata.source_uri,
      asset_count: 1,
      field_count: 0,
      discovery_manifest: manifest,
      consistency_mode: manifest.consistency_mode,
      discovery_content_access: 'METADATA_ONLY',
    },
  }
}
