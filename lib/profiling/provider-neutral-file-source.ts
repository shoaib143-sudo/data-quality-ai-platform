import { createObjectStorage } from '@/lib/storage/factory'
import type { StorageReference } from '@/lib/storage/contracts'
import type { FileSourceConfig, FileSourceResult } from '@/lib/profiling/file-source-adapter'

const R2_READ_TTL_SECONDS = 5 * 60

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

export function parseR2SourceUri(sourceUri: string | null | undefined) {
  const value = sourceUri?.trim() ?? ''
  const match = /^r2:\/\/([^/]+)\/(.+)$/i.exec(value)
  if (!match) return null
  const bucket = decodeURIComponent(match[1])
  const key = match[2]
  if (!bucket || !key) throw new Error('R2 source URI is incomplete.')
  return { bucket, key, sourceUri: `r2://${bucket}/${key}` }
}

export async function resolveProviderNeutralFileConfig(config: FileSourceConfig): Promise<{
  config: FileSourceConfig
  canonicalSourceUri: string | null
  provider: 'r2' | null
}> {
  const r2 = parseR2SourceUri(config.sourceUri)
  if (!r2) return { config, canonicalSourceUri: config.sourceUri?.trim() || null, provider: null }

  const storage = createObjectStorage('r2')
  const reference: StorageReference = {
    provider: 'r2',
    bucket: r2.bucket,
    key: r2.key,
  }
  const authorization = await storage.createDownloadAuthorization({ reference, expiresInSeconds: R2_READ_TTL_SECONDS })
  if (!authorization.url) throw new Error('R2 file source could not be authorized for server-side reading.')

  return {
    provider: 'r2',
    canonicalSourceUri: r2.sourceUri,
    config: {
      sourceUri: r2.sourceUri,
      executionConfig: {
        ...record(config.executionConfig),
        url: authorization.url,
        storage_provider: 'r2',
        storage_bucket: r2.bucket,
        storage_path: r2.key,
      },
    },
  }
}

export function sanitizeProviderNeutralFileResult(
  result: FileSourceResult,
  canonicalSourceUri: string | null,
  provider: 'r2' | null,
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
