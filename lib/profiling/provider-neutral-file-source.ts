import { createObjectStorage } from '@/lib/storage/factory'
import type { StorageReference } from '@/lib/storage/contracts'
import type { FileSourceConfig, FileSourceResult } from '@/lib/profiling/file-source-adapter'

const R2_READ_TTL_SECONDS = 5 * 60

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function parseObjectStorageSourceUri(sourceUri: string | null | undefined) {
  const value = sourceUri?.trim() ?? ''
  const match = /^(r2|supabase|storage):\/\/([^/]+)\/(.+)$/i.exec(value)
  if (!match) return null
  const provider = match[1].toLowerCase() === 'r2' ? 'r2' : 'supabase'
  const bucket = decodeURIComponent(match[2])
  const key = match[3].replace(/^\/+|\/+$/g, '')
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
    const configuredPrefix = (process.env.R2_PREFIX ?? '').trim().replace(/^\/+|\/+$/g, '')
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
