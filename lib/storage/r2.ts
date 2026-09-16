import { createHash, createHmac } from 'node:crypto'
import type {
  HeadObjectResult,
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
  method: 'GET' | 'PUT' | 'HEAD' | 'DELETE',
  bucket: string,
  key: string,
  body?: BodyInit,
  contentType?: string,
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
  }
  if (contentType) headers['content-type'] = contentType

  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join('')
  const canonicalRequest = [method, url.pathname, '', canonicalHeaders, signedHeaderNames.join(';'), hash].join('\n')
  const stringToSign = [ALGORITHM, amz, scope, sha256(canonicalRequest)].join('\n')
  const signature = createHmac('sha256', signingKey(secretAccessKey, date)).update(stringToSign).digest('hex')
  const authorization = `${ALGORITHM} Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaderNames.join(';')}, Signature=${signature}`

  const requestHeaders = new Headers(headers)
  requestHeaders.set('authorization', authorization)
  requestHeaders.delete('host')
  return fetch(url, { method, headers: requestHeaders, body })
}

export class R2StorageAdapter implements ObjectStorage {
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
    return {
      exists: true,
      sizeBytes: parsedSize !== undefined && Number.isFinite(parsedSize) ? parsedSize : undefined,
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
}
