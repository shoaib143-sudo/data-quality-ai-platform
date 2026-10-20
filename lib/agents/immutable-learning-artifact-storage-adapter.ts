import type { ImmutableLearningArtifactBackend } from './immutable-learning-artifact-store'

type StorageError = {
  error?: string
  message?: string
  status?: number
  statusCode?: string | number
}

export type ImmutableArtifactStorageClient = {
  storage: {
    from(bucket: string): {
      upload(
        key: string,
        bytes: Uint8Array,
        options: { contentType: string; upsert: false },
      ): Promise<{ error: StorageError | null }>
      download(key: string): Promise<{ data: Blob | null; error: StorageError | null }>
    }
  }
}

function requiredBucket(bucket: string) {
  const normalized = bucket.trim()
  if (!normalized || normalized.includes('/') || normalized === '.' || normalized === '..') {
    throw new Error('LEARNING_ARTIFACT_BUCKET_INVALID')
  }
  return normalized
}

function duplicateObject(error: StorageError) {
  const status = Number(error.statusCode ?? error.status)
  const message = (error.message ?? '').toLowerCase()
  const code = (error.error ?? '').toLowerCase()
  return status === 409 || (status === 400 && (code === 'duplicate' || message.includes('asset already exists')))
}

function missingObject(error: StorageError) {
  const status = Number(error.statusCode ?? error.status)
  const message = (error.message ?? '').toLowerCase()
  return status === 404 || message.includes('not found')
}

function validateLearningKey(key: string) {
  const normalized = key.replaceAll('\\', '/')
  const parts = normalized.split('/')
  if (
    normalized !== key
    || !key.startsWith('learning/')
    || parts.some(part => !part || part === '.' || part === '..')
  ) {
    throw new Error('LEARNING_ARTIFACT_KEY_INVALID')
  }
}

/**
 * Adapts Supabase Storage to the create-only learning-artifact port. The
 * injected SDK client keeps tests offline. Supabase upload uses upsert:false,
 * so concurrent writes for one content-addressed key cannot overwrite bytes.
 */
export function createSupabaseImmutableLearningArtifactBackend(
  client: ImmutableArtifactStorageClient,
  bucketName: string,
): ImmutableLearningArtifactBackend {
  const bucket = requiredBucket(bucketName)

  return {
    async putIfAbsent({ key, bytes, contentType }) {
      validateLearningKey(key)
      const { error } = await client.storage.from(bucket).upload(key, Uint8Array.from(bytes), {
        contentType,
        upsert: false,
      })
      if (!error) return true
      if (duplicateObject(error)) return false
      throw new Error(`LEARNING_ARTIFACT_STORAGE_WRITE_FAILED: ${error.message ?? 'unknown storage error'}`)
    },

    async get(key) {
      validateLearningKey(key)
      const { data, error } = await client.storage.from(bucket).download(key)
      if (error) {
        if (missingObject(error)) return null
        throw new Error(`LEARNING_ARTIFACT_STORAGE_READ_FAILED: ${error.message ?? 'unknown storage error'}`)
      }
      if (!data) return null
      return new Uint8Array(await data.arrayBuffer())
    },
  }
}
