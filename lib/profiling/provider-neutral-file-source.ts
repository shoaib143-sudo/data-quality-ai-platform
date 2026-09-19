import { createObjectStorage } from '@/lib/storage/factory'
import type { StorageReference } from '@/lib/storage/contracts'
import type { FileSourceConfig, FileSourceResult } from '@/lib/profiling/file-source-adapter'

const R2_READ_TTL_SECONDS = 5 * 60

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function trimBoundarySlashes(value: string) {
  let start = 0
  let end = value.length
  while (start < end && value.charCodeAt(start) === 47) start += 1
  while (end > start && value.charCodeAt(end - 1) === 47) end -= 1
  return value.slice(start, end)
}

export function parseObjectStorageSourceUri(sourceUri: string | null | undefined) {
  const value = sourceUri?.trim() ?? ''
  const schemeSeparator = value.indexOf('://')
  if (schemeSeparator <= 0) return null
  const scheme = value.slice(0, schemeSeparator).toLowerCase()
  if (scheme !== 'r2' && scheme !== 'supabase' && scheme !== 'storage') return null

  const location = value.slice(schemeSeparator + 3)
  const bucketSeparator = location.indexOf('/')
  if (bucketSeparator <= 0 || bucketSeparator === location.length - 1) return null

  const provider = scheme === 'r2' ? 'r2' : 'supabase'
  const bucket = decodeURIComponent(location.slice(0, bucketSeparator))
  const key = trimBoundarySlashes(location.slice(bucketSeparator + 1))
  if (!bucket || !key || key.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Object-storage source URI is incomplete or invalid.')
  }
  const canonicalSourceUri = provider === 'r2'
    ? `r2://${bucket}/${key}`
    : `storage://${bucket}/${key}`
  return { provider, bucket, key, sourceUri: canonicalSourceUri }
}

export function assertProjectScopedObjectStorageSource(
  parsed: NonNullable<ReturnType<typeof parseObjectStorageSourceUri>>,
  projectId: string,
) {
  const requiredPrefix = `projects/${projectId}/`
  if (parsed.provider === 'r2') {
    const configuredBucket = process.env.R2_BUCKET?.trim()
    const configuredPrefix = trimBoundarySlashes((process.env.R2_PREFIX ?? '').trim())
    if (!configuredBucket || parsed.bucket !== configuredBucket) {
      throw new Error('R2 FILE source bucket is outside the configured application scope.')
    }
    const projectPath = configuredPrefix && parsed.key.startsWith(`${configuredPrefix}/`)
      ? parsed.key.slice(configuredPrefix.length + 1)
      : parsed.key
    if (!projectPath.startsWith(requiredPrefix) || projectPath.length <= requiredPrefix.length) {
      throw new Error(`R2 FILE source must be stored under ${requiredPrefix}...`)
    }
    return
  }

  if (parsed.bucket !== 'dataset-files'
    || !parsed.key.startsWith(requiredPrefix)
    || parsed.key.length <= requiredPrefix.length) {
    throw new Error(`Supabase FILE source must be stored under dataset-files/${requiredPrefix}...`)
  }
}

export function parseR2SourceUri(sourceUri: string | null | undefined) {
  const parsed = parseObjectStorageSourceUri(sourceUri)
  return parsed?.provider === 'r2' ? parsed : null
}

export async function resolveProviderNeutralFileConfig(config: FileSourceConfig): Promise<{
  config: FileSourceConfig
  canonicalSourceUri: string | null
  provider: 'r2' | 'supabase' | null
}> {
  const objectStorage = parseObjectStorageSourceUri(config.sourceUri)
  if (!objectStorage) return { config, canonicalSourceUri: config.sourceUri?.trim() || null, provider: null }

  if (objectStorage.provider === 'supabase') {
    return {
      provider: 'supabase',
      canonicalSourceUri: objectStorage.sourceUri,
      config: {
        sourceUri: objectStorage.sourceUri,
        executionConfig: {
          ...record(config.executionConfig),
          storage_provider: 'supabase',
          storage_bucket: objectStorage.bucket,
          storage_path: objectStorage.key,
          bucket: objectStorage.bucket,
          path: objectStorage.key,
        },
      },
    }
  }

  const storage = createObjectStorage('r2')
  const reference: StorageReference = {
    provider: 'r2',
    bucket: objectStorage.bucket,
    key: objectStorage.key,
  }
  const head = await storage.headObject(reference)
  if (!head.exists) throw new Error('R2 file source does not exist.')
  const authorization = await storage.createDownloadAuthorization({ reference, expiresInSeconds: R2_READ_TTL_SECONDS })
  if (!authorization.url) throw new Error('R2 file source could not be authorized for server-side reading.')

  return {
    provider: 'r2',
    canonicalSourceUri: objectStorage.sourceUri,
    config: {
      sourceUri: objectStorage.sourceUri,
      executionConfig: {
        ...record(config.executionConfig),
        url: authorization.url,
        storage_provider: 'r2',
        storage_bucket: objectStorage.bucket,
        storage_path: objectStorage.key,
        storage_size_bytes: head.sizeBytes,
        storage_content_type: head.contentType,
        storage_etag: head.etag,
        storage_size_bytes_authority: head.sizeBytes === undefined ? 'UNKNOWN' : 'SOURCE_OBSERVED',
      },
    },
  }
}

export function sanitizeProviderNeutralFileResult(
  result: FileSourceResult,
  canonicalSourceUri: string | null,
  provider: 'r2' | 'supabase' | null,
): FileSourceResult {
  if (!provider || !canonicalSourceUri) return result
  return {
    ...result,
    sourceUri: canonicalSourceUri,
    metadata: {
      ...result.metadata,
      source_uri: canonicalSourceUri,
      storage_provider: provider,
    },
  }
}
