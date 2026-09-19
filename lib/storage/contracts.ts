export type StorageProvider = 'supabase' | 'r2'

export type StorageObjectStatus =
  | 'PENDING'
  | 'UPLOADING'
  | 'UPLOADED'
  | 'VERIFYING'
  | 'READY'
  | 'FAILED'
  | 'QUARANTINED'
  | 'DELETED'

export interface StorageReference {
  provider: StorageProvider
  bucket: string
  key: string
  sizeBytes?: number
  contentType?: string
  checksum?: string
  checksumAlgorithm?: 'sha256'
}

export interface SignedStorageOperation {
  url?: string
  token?: string
  expiresAt?: string
  provider: StorageProvider
  bucket: string
  key: string
  requiredHeaders?: Record<string, string>
}

export interface PutObjectInput {
  bucket: string
  key: string
  body: BodyInit
  contentType?: string
  checksum?: string
}

export interface HeadObjectResult {
  exists: boolean
  sizeBytes?: number
  contentType?: string
  etag?: string
  checksum?: string
}

export interface ObjectStorage {
  readonly provider: StorageProvider

  putObject(input: PutObjectInput): Promise<StorageReference>
  getObject(reference: StorageReference): Promise<Response>
  headObject(reference: StorageReference): Promise<HeadObjectResult>
  deleteObject(reference: StorageReference): Promise<void>
  exists(reference: StorageReference): Promise<boolean>

  createUploadAuthorization(input: {
    bucket: string
    key: string
    contentType?: string
    expiresInSeconds: number
  }): Promise<SignedStorageOperation>

  createDownloadAuthorization(input: {
    reference: StorageReference
    expiresInSeconds: number
  }): Promise<SignedStorageOperation>
}


export type MultipartUploadPart = {
  partNumber: number
  etag: string
}

export type MultipartUploadSession = {
  provider: 'r2'
  bucket: string
  key: string
  uploadId: string
}

export interface MultipartObjectStorage extends ObjectStorage {
  createMultipartUpload(input: {
    bucket: string
    key: string
    contentType?: string
  }): Promise<MultipartUploadSession>

  createMultipartPartAuthorization(input: {
    bucket: string
    key: string
    uploadId: string
    partNumber: number
    expiresInSeconds: number
  }): Promise<SignedStorageOperation & { partNumber: number; uploadId: string }>

  completeMultipartUpload(input: {
    bucket: string
    key: string
    uploadId: string
    parts: MultipartUploadPart[]
  }): Promise<StorageReference>

  abortMultipartUpload(input: {
    bucket: string
    key: string
    uploadId: string
  }): Promise<void>
}
