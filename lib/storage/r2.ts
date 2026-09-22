import { createHash, createHmac } from 'node:crypto'
import type {
  HeadObjectResult,
  MultipartObjectStorage,
  MultipartUploadPart,
  ObjectStorage,
  PutObjectInput,
  SignedStorageOperation,
  StorageReference,
} from './contracts'

const REGION = 'auto'
const SERVICE = 's3'
const ALGORITHM = 'AWS4-HMAC-SHA256'

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required R2 configuration: ${name}`)
  return value
}

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function dateStamp(amz: string) {
  return amz.slice(0, 8)
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)
}

function canonicalPath(bucket: string, key = '') {
  const parts = [bucket, ...key.split('/').filter(Boolean)].map(encodePathSegment)
  return `/${parts.join('/')}`
}

function canonicalQuery(params: Record<string, string>) {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${encodePathSegment(key)}=${encodePathSegment(value)}`)
    .join('&')
}

function signingKey(secret: string, date: string) {
  const kDate = createHmac('sha256', `AWS4${secret}`).update(date).digest()
  const kRegion = createHmac('sha256', kDate).update(REGION).digest()
  const kService = createHmac('sha256', kRegion).update(SERVICE).digest()
  return createHmac('sha256', kService).update('aws4_request').digest()
}

function config() {
  return {
    accountId: required('R2_ACCOUNT_ID'),
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    bucket: required('R2_BUCKET'),
    endpoint: required('R2_ENDPOINT'),
    prefix: (process.env.R2_PREFIX ?? '').trim().replace(/^\/+|\/+$/g, ''),
  }
}

function endpointUrl() {
  const cfg = config()
  const endpoint = new URL(cfg.endpoint.endsWith('/') ? cfg.endpoint : `${cfg.endpoint}/`)
  const expectedHost = `${cfg.accountId}.r2.cloudflarestorage.com`
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== expectedHost) {
    throw new Error('R2_ENDPOINT does not match the configured R2 account.')
  }
  return endpoint
}

function normalizeKey(key: string) {
  const normalized = key.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  if (!normalized || normalized.includes('\0') || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('R2 object key is invalid.')
  }
  return normalized
}

function assertBucket(bucket: string) {
  const configured = config().bucket
  if (bucket !== configured) throw new Error('R2 bucket is outside the configured application scope.')
  return configured
}

function scopedKey(key: string) {
  const { prefix } = config()
  const normalized = normalizeKey(key)
  if (!prefix) return normalized
  return normalized === prefix || normalized.startsWith(`${prefix}/`) ? normalized : `${prefix}/${normalized}`
}

function assertReference(reference: StorageReference) {
  if (reference.provider !== 'r2') throw new Error('R2 adapter received a non-R2 storage reference.')
  assertBucket(reference.bucket)
  const key = normalizeKey(reference.key)
  const { prefix } = config()
  if (prefix && key !== prefix && !key.startsWith(`${prefix}/`)) {
    throw new Error('R2 object key is outside the configured application prefix.')
  }
  return { bucket: reference.bucket, key }
}

function objectUrl(bucket: string, key: string) {
  assertBucket(bucket)
  const endpoint = endpointUrl()
  endpoint.pathname = canonicalPath(bucket, normalizeKey(key))
  return endpoint
}

function presign(
  method: 'GET' | 'PUT',
  bucket: string,
  key: string,
  expiresInSeconds: number,
  contentType?: string,
  operationParams: Record<string, string> = {},
) {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 604800) {
    throw new Error('R2 signed URL expiry must be between 1 and 604800 seconds.')
  }

  const { accessKeyId, secretAccessKey } = config()
  const now = new Date()
  const amz = amzDate(now)
  const date = dateStamp(amz)
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const url = objectUrl(bucket, key)
  const signedHeaders: Record<string, string> = { host: url.host }
  if (method === 'PUT' && contentType) signedHeaders['content-type'] = contentType.trim()
  const signedHeaderNames = Object.keys(signedHeaders).sort()
  const signedHeaderList = signedHeaderNames.join(';')

  const params = {
    ...operationParams,
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': amz,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': signedHeaderList,
  }
  const query = canonicalQuery(params)
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${signedHeaders[name]}\n`).join('')
  const canonicalRequest = [method, url.pathname, query, canonicalHeaders, signedHeaderList, 'UNSIGNED-PAYLOAD'].join('\n')
  const stringToSign = [ALGORITHM, amz, scope, sha256(canonicalRequest)].join('\n')
  const signature = createHmac('sha256', signingKey(secretAccessKey, date)).update(stringToSign).digest('hex')
  url.search = `${query}&X-Amz-Signature=${signature}`
  return url.toString()
}

async function payloadHash(body?: BodyInit) {
  if (body == null) return sha256('')
  if (typeof body === 'string' || Buffer.isBuffer(body)) return sha256(body)
  if (body instanceof ArrayBuffer) return sha256(Buffer.from(body))
  if (ArrayBuffer.isView(body)) return sha256(Buffer.from(body.buffer, body.byteOffset, body.byteLength))
  if (typeof Blob !== 'undefined' && body instanceof Blob) return sha256(Buffer.from(await body.arrayBuffer()))
  throw new Error('Unsupported R2 server-side request body type.')
}

async function signedFetch(
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE' | 'POST',
  bucket: string,
  key: string,
  body?: BodyInit,
  contentType?: string,
  extraHeaders: Record<string, string> = {},
  queryParams: Record<string, string> = {},
) {
  const { accessKeyId, secretAccessKey } = config()
  const now = new Date()
  const amz = amzDate(now)
  const date = dateStamp(amz)
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const url = objectUrl(bucket, key)
  const hash = await payloadHash(body)
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': hash,
    'x-amz-date': amz,
    ...extraHeaders,
  }
  if (contentType) headers['content-type'] = contentType

  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join('')
  const query = canonicalQuery(queryParams)
  const canonicalRequest = [method, url.pathname, query, canonicalHeaders, signedHeaderNames.join(';'), hash].join('\n')
  const stringToSign = [ALGORITHM, amz, scope, sha256(canonicalRequest)].join('\n')
  const signature = createHmac('sha256', signingKey(secretAccessKey, date)).update(stringToSign).digest('hex')
  const authorization = `${ALGORITHM} Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`

  if (query) url.search = query
  const requestHeaders = new Headers(headers)
  requestHeaders.set('authorization', authorization)
  requestHeaders.delete('host')
  return fetch(url, { method, headers: requestHeaders, body })
}

function normalizeUploadId(uploadId: string) {
  const value = uploadId.trim()
  if (!value || value.length > 2048 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new Error('R2 multipart upload id is invalid.')
  }
  return value
}

function normalizePartNumber(partNumber: number) {
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > 10_000) {
    throw new Error('R2 multipart part number must be between 1 and 10000.')
  }
  return partNumber
}

function normalizeCompletedParts(parts: MultipartUploadPart[]) {
  if (!Array.isArray(parts) || parts.length < 1 || parts.length > 10_000) {
    throw new Error('R2 multipart completion requires between 1 and 10000 parts.')
  }
  return parts.map((part, index) => {
    const partNumber = normalizePartNumber(part.partNumber)
    if (partNumber !== index + 1) {
      throw new Error('R2 multipart completion parts must be contiguous and ordered.')
    }
    const etag = part.etag.trim().replace(/^"|"$/g, '')
    if (!/^[0-9a-f]{32}$/i.test(etag)) {
      throw new Error('R2 multipart part ETag is invalid.')
    }
    return { partNumber, etag }
  })
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function multipartCompleteXml(parts: MultipartUploadPart[]) {
  const normalized = normalizeCompletedParts(parts)
  return `<CompleteMultipartUpload>${normalized.map((part) =>
    `<Part><PartNumber>${part.partNumber}</PartNumber><ETag>"${escapeXml(part.etag)}"</ETag></Part>`
  ).join('')}</CompleteMultipartUpload>`
}

function uploadIdFromCreateResponse(xml: string) {
  const match = xml.match(/<UploadId>([^<]+)<\/UploadId>/i)
  if (!match?.[1]) throw new Error('R2 multipart initiation response did not include an upload id.')
  return normalizeUploadId(match[1])
}

async function sizeFromRange(bucket: string, key: string) {
  const response = await signedFetch('GET', bucket, key, undefined, undefined, { range: 'bytes=0-0' })
  try {
    if (response.status !== 206) return undefined
    const contentRange = response.headers.get('content-range')
    const match = contentRange?.match(/\/(\d+)$/)
    if (!match) return undefined
    const total = Number(match[1])
    return Number.isFinite(total) ? total : undefined
  } finally {
    await response.body?.cancel().catch(() => undefined)
  }
}


function bucketUrl(bucket: string) {
  assertBucket(bucket)
  const endpoint = endpointUrl()
  endpoint.pathname = canonicalPath(bucket)
  return endpoint
}

async function signedBucketFetch(method: 'GET', bucket: string, queryParams: Record<string, string>) {
  const { accessKeyId, secretAccessKey } = config()
  const now = new Date()
  const amz = amzDate(now)
  const date = dateStamp(amz)
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const url = bucketUrl(bucket)
  const hash = sha256('')
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': hash,
    'x-amz-date': amz,
  }

  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join('')
  const query = canonicalQuery(queryParams)
  const canonicalRequest = [method, url.pathname, query, canonicalHeaders, signedHeaderNames.join(';'), hash].join('\n')
  const stringToSign = [ALGORITHM, amz, scope, sha256(canonicalRequest)].join('\n')
  const signature = createHmac('sha256', signingKey(secretAccessKey, date)).update(stringToSign).digest('hex')
  const authorization = `${ALGORITHM} Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`

  if (query) url.search = query
  const requestHeaders = new Headers(headers)
  requestHeaders.set('authorization', authorization)
  requestHeaders.delete('host')
  return fetch(url, { method, headers: requestHeaders })
}

function decodeR2XmlText(value: string) {
  // Decode exactly one XML escaping layer. Ampersand is intentionally last so
  // values such as &amp;lt; remain &lt; instead of being double-unescaped.
  return value
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&amp;', '&')
}

function scopedPrefix(prefix: string) {
  const trimmed = prefix.trim().replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  const normalized = normalizeKey(trimmed)
  const configuredPrefix = config().prefix
  const scoped = configuredPrefix && normalized !== configuredPrefix && !normalized.startsWith(`${configuredPrefix}/`)
    ? `${configuredPrefix}/${normalized}`
    : normalized
  return `${scoped}/`
}

export async function listR2ObjectKeysByPrefix(input: { prefix: string; maxKeys?: number }) {
  const maxKeys = input.maxKeys ?? 100
  if (!Number.isInteger(maxKeys) || maxKeys < 1 || maxKeys > 1000) {
    throw new Error('R2 list maxKeys must be between 1 and 1000.')
  }

  const bucket = config().bucket
  const prefix = scopedPrefix(input.prefix)
  const response = await signedBucketFetch('GET', bucket, {
    'list-type': '2',
    prefix,
    'max-keys': String(maxKeys),
  })
  const xml = await response.text()
  if (!response.ok) throw new Error(`R2 LIST failed with status ${response.status}.`)

  const keys = [...xml.matchAll(/<Key>([\s\S]*?)<\/Key>/gi)].map((match) => decodeR2XmlText(match[1]))
  const truncated = /<IsTruncated>\s*true\s*<\/IsTruncated>/i.test(xml)
  return { bucket, prefix, keys, truncated }
}

export class R2StorageAdapter implements ObjectStorage, MultipartObjectStorage {
  readonly provider = 'r2' as const

  private bucket() {
    return config().bucket
  }

  async putObject(input: PutObjectInput): Promise<StorageReference> {
    const bucket = assertBucket(input.bucket || this.bucket())
    const key = scopedKey(input.key)
    const response = await signedFetch('PUT', bucket, key, input.body, input.contentType)
    if (!response.ok) throw new Error(`R2 PUT failed with status ${response.status}.`)
    return {
      provider: this.provider,
      bucket,
      key,
      contentType: input.contentType,
      checksum: input.checksum,
      checksumAlgorithm: input.checksum ? 'sha256' : undefined,
    }
  }

  async getObject(reference: StorageReference): Promise<Response> {
    const { bucket, key } = assertReference(reference)
    const response = await signedFetch('GET', bucket, key)
    if (!response.ok) throw new Error(`R2 GET failed with status ${response.status}.`)
    return response
  }

  async headObject(reference: StorageReference): Promise<HeadObjectResult> {
    const { bucket, key } = assertReference(reference)
    const response = await signedFetch('HEAD', bucket, key)
    if (response.status === 404) return { exists: false }
    if (!response.ok) throw new Error(`R2 HEAD failed with status ${response.status}.`)
    const contentLength = response.headers.get('content-length')
    const parsedSize = contentLength === null ? undefined : Number(contentLength)
    const headSize = parsedSize !== undefined && Number.isFinite(parsedSize) ? parsedSize : undefined
    const sizeBytes = headSize ?? await sizeFromRange(bucket, key)
    return {
      exists: true,
      sizeBytes,
      contentType: response.headers.get('content-type') ?? undefined,
      etag: response.headers.get('etag')?.replace(/^"|"$/g, ''),
    }
  }

  async deleteObject(reference: StorageReference): Promise<void> {
    const { bucket, key } = assertReference(reference)
    const response = await signedFetch('DELETE', bucket, key)
    if (!response.ok && response.status !== 404) throw new Error(`R2 DELETE failed with status ${response.status}.`)
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
    const bucket = assertBucket(input.bucket || this.bucket())
    const key = scopedKey(input.key)
    const contentType = input.contentType?.trim()
    return {
      provider: this.provider,
      bucket,
      key,
      url: presign('PUT', bucket, key, input.expiresInSeconds, contentType),
      requiredHeaders: contentType ? { 'content-type': contentType } : undefined,
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
    }
  }

  async createDownloadAuthorization(input: {
    reference: StorageReference
    expiresInSeconds: number
  }): Promise<SignedStorageOperation> {
    const { bucket, key } = assertReference(input.reference)
    return {
      provider: this.provider,
      bucket,
      key,
      url: presign('GET', bucket, key, input.expiresInSeconds),
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
    }
  }

  async createMultipartUpload(input: {
    bucket: string
    key: string
    contentType?: string
  }) {
    const bucket = assertBucket(input.bucket || this.bucket())
    const key = scopedKey(input.key)
    const contentType = input.contentType?.trim()
    const response = await signedFetch('POST', bucket, key, undefined, contentType, {}, { uploads: '' })
    const xml = await response.text()
    if (!response.ok) throw new Error(`R2 multipart initiation failed with status ${response.status}.`)
    return {
      provider: this.provider,
      bucket,
      key,
      uploadId: uploadIdFromCreateResponse(xml),
    } as const
  }

  async createMultipartPartAuthorization(input: {
    bucket: string
    key: string
    uploadId: string
    partNumber: number
    expiresInSeconds: number
  }) {
    const bucket = assertBucket(input.bucket || this.bucket())
    const key = scopedKey(input.key)
    const uploadId = normalizeUploadId(input.uploadId)
    const partNumber = normalizePartNumber(input.partNumber)
    return {
      provider: this.provider,
      bucket,
      key,
      uploadId,
      partNumber,
      url: presign('PUT', bucket, key, input.expiresInSeconds, undefined, {
        partNumber: String(partNumber),
        uploadId,
      }),
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
    } as const
  }

  async completeMultipartUpload(input: {
    bucket: string
    key: string
    uploadId: string
    parts: MultipartUploadPart[]
  }): Promise<StorageReference> {
    const bucket = assertBucket(input.bucket || this.bucket())
    const key = scopedKey(input.key)
    const uploadId = normalizeUploadId(input.uploadId)
    const body = multipartCompleteXml(input.parts)
    const response = await signedFetch(
      'POST',
      bucket,
      key,
      body,
      'application/xml',
      {},
      { uploadId },
    )
    const responseBody = await response.text()
    if (!response.ok || /<Error(?:\s|>)/i.test(responseBody)) {
      throw new Error(`R2 multipart completion failed with status ${response.status}.`)
    }
    return { provider: this.provider, bucket, key }
  }

  async abortMultipartUpload(input: {
    bucket: string
    key: string
    uploadId: string
  }): Promise<void> {
    const bucket = assertBucket(input.bucket || this.bucket())
    const key = scopedKey(input.key)
    const uploadId = normalizeUploadId(input.uploadId)
    const response = await signedFetch('DELETE', bucket, key, undefined, undefined, {}, { uploadId })
    if (!response.ok && response.status !== 404) {
      throw new Error(`R2 multipart abort failed with status ${response.status}.`)
    }
  }
}
