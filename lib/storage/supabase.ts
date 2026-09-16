import { createAdminClient } from '@/lib/supabase/admin'
import type {
  HeadObjectResult,
  ObjectStorage,
  PutObjectInput,
  SignedStorageOperation,
  StorageReference,
} from './contracts'

export class SupabaseStorageAdapter implements ObjectStorage {
  readonly provider = 'supabase' as const

  private client() {
    return createAdminClient()
  }

  async putObject(input: PutObjectInput): Promise<StorageReference> {
    const { error } = await this.client().storage.from(input.bucket).upload(input.key, input.body, {
      contentType: input.contentType,
      upsert: false,
    })
    if (error) throw new Error(`Supabase Storage PUT failed: ${error.message}`)
    return {
      provider: this.provider,
      bucket: input.bucket,
      key: input.key,
      contentType: input.contentType,
      checksum: input.checksum,
      checksumAlgorithm: input.checksum ? 'sha256' : undefined,
    }
  }

  async getObject(reference: StorageReference): Promise<Response> {
    const { data, error } = await this.client().storage.from(reference.bucket).download(reference.key)
    if (error || !data) throw new Error(`Supabase Storage GET failed: ${error?.message ?? 'missing object'}`)
    return new Response(data, {
      headers: reference.contentType ? { 'content-type': reference.contentType } : undefined,
    })
  }

  async headObject(reference: StorageReference): Promise<HeadObjectResult> {
    const { data, error } = await this.client().storage.from(reference.bucket).info(reference.key)
    if (error) {
      const message = error.message.toLowerCase()
      if (message.includes('not found') || message.includes('404')) return { exists: false }
      throw new Error(`Supabase Storage HEAD failed: ${error.message}`)
    }
    return {
      exists: true,
      sizeBytes: typeof data.size === 'number' ? data.size : undefined,
      contentType: typeof data.contentType === 'string' ? data.contentType : undefined,
      etag: typeof data.etag === 'string' ? data.etag.replace(/^"|"$/g, '') : undefined,
    }
  }

  async deleteObject(reference: StorageReference): Promise<void> {
    const { error } = await this.client().storage.from(reference.bucket).remove([reference.key])
    if (error) throw new Error(`Supabase Storage DELETE failed: ${error.message}`)
  }

  async exists(reference: StorageReference): Promise<boolean> {
    return (await this.headObject(reference)).exists
  }

  async createUploadAuthorization(input: {
    bucket: string
    key: string
    contentType?: string
    expiresInSeconds: number
  }): Promise<SignedStorageOperation> {
    const { data, error } = await this.client().storage.from(input.bucket).createSignedUploadUrl(input.key, { upsert: false })
    if (error || !data?.token) {
      throw new Error(`Supabase Storage upload authorization failed: ${error?.message ?? 'missing signed upload token'}`)
    }
    return {
      provider: this.provider,
      bucket: input.bucket,
      key: input.key,
      token: data.token,
      url: typeof data.signedUrl === 'string' ? data.signedUrl : undefined,
    }
  }

  async createDownloadAuthorization(input: {
    reference: StorageReference
    expiresInSeconds: number
  }): Promise<SignedStorageOperation> {
    const { data, error } = await this.client().storage
      .from(input.reference.bucket)
      .createSignedUrl(input.reference.key, input.expiresInSeconds)
    if (error || !data?.signedUrl) {
      throw new Error(`Supabase Storage download authorization failed: ${error?.message ?? 'missing signed URL'}`)
    }
    return {
      provider: this.provider,
      bucket: input.reference.bucket,
      key: input.reference.key,
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
    }
  }
}
