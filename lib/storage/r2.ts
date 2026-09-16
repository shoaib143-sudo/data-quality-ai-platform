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

function hmac(key: Buffer | string, value: string, encoding?: 'hex') {
  return createHmac('sha256', key).update(value).digest(encoding as 'hex')
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

function endpointUrl() {
  const raw = required('R2_ENDPOINT')
  return new URL(raw.endsWith('/') ? raw : `${raw}/`)
}

function objectUrl(bucket: string, key: string) {
  const endpoint = endpointUrl()
  endpoint.pathname = canonicalPath(bucket, key)
  return endpoint
}

function config() {
  return {
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    bucket: required('R2_BUCKET'),
    prefix: (process.env.R2_PREFIX ?? '').trim().replace(/^\/+|\/+$/g, ''),
  }
}

function scopedKey(key: string) {
  const { prefix } = config()
  const normalized = key.replace(/^\/+/, '')
  return prefix ? `${prefix}/${normalized}` : normalized
}

function presign(method: 'GET' | 'PUT', bucket: string, key: string, expiresInSeconds: number) {
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 604800) {
    throw new Error('R2 signed URL expiry must be between 1 and 604800 seconds.')
  }

  const { accessKeyId, secretAccessKey } = config()
  const now = new Date()
  const amz = amzDate(now)
  const date = dateStamp(amz)
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const url = objectUrl(bucket, key)

  const params = {
    'X-Amz-Algorithm': ALGORITHM,
    'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': amz,
    'X-Amz-Expires': String(expiresInSeconds),
    'X-Amz-SignedHeaders': 'host',
  }
  const query = canonicalQuery(params)
  const canonicalRequest = [
    method,
    url.pathname,
    query,
    `host:${url.host}\n`,
    'host',
    'UNSIGNED-PAYLOAD',
  ].join('\n')
  const stringToSign = [ALGORITHM, amz, scope, sha256(canonicalRequest)].join('\n')
  const signature = createHmac('sha256', signingKey(secretAccessKey, date)).update(stringToSign).digest('hex')
  url.search = `${query}&X-Amz-Signature=${signature}`
  return url.toString()
}

async function signedFetch(method: 'GET' | 'PUT' | 'HEAD' | 'DELETE', bucket: string, key: string, body?: BodyInit, contentType?: string) {
  const { accessKeyId, secretAccessKey } = config()
  const now = new Date()
  const amz = amzDate(now)
  const date = dateStamp(amz)
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const url = objectUrl(bucket, key)
  const payload = typeof body === 'string' || Buffer.isBuffer(body) ? body : ''
  const payloadHash = body ? sha256(payload as string | Buffer) : sha256('')
  const headers: Record<string, string> = {
    host: url.host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amz,
  }
  if (contentType) headers['content-type'] = contentType

  const signedHeaderNames = Object.keys(headers).sort()
  const canonicalHeaders = signedHeaderNames.map((name) => `${name}:${headers[name].trim()}\n`).join('')
  const canonicalRequest = [
    method,
    url.pathname,
    '',
    canonicalHeaders,
    signedHeaderNames.join(';'),
    payloadHash,
  ].join('\n')
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
    const key = scopedKey(input.key)
    const response = await signedFetch('PUT', input.bucket || this.bucket(), key, input.body, input.contentType)
    if (!response.ok) throw new Error(`R2 PUT failed with status ${response.status}.`)
    return {
      provider: this.provider,
      bucket: input.bucket || this.bucket(),
      key,
      contentType: input.contentType,
      checksum: input.checksum,
      checksumAlgorithm: input.checksum ? 'sha256' : undefined,
    }
  }

  async getObject(reference: StorageReference): Promise<Response> {
    const response = await signedFetch('GET', reference.bucket, reference.key)
    if (!response.ok) throw new Error(`R2 GET failed with status ${response.status}.`)
    return response
  }

  async headObject(reference: StorageReference): Promise<HeadObjectResult> {
    const response = await signedFetch('HEAD', reference.bucket, reference.key)
    if (response.status === 404) return { exists: false }
    if (!response.ok) throw new Error(`R2 HEAD failed with status ${response.status}.`)
    const size = Number(response.headers.get('content-length'))
    return {
      exists: true,
      sizeBytes: Number.isFinite(size) ? size : undefined,
      contentType: response.headers.get('content-type') ?? undefined,
      etag: response.headers.get('etag')?.replace(/^"|"$/g, ''),
    }
  }

  async deleteObject(reference: StorageReference): Promise<void> {
    const response = await signedFetch('DELETE', reference.bucket, reference.key)
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
    const bucket = input.bucket || this.bucket()
    const key = scopedKey(input.key)
    return {
      provider: this.provider,
      bucket,
      key,
      url: presign('PUT', bucket, key, input.expiresInSeconds),
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
    }
  }

  async createDownloadAuthorization(input: {
    reference: StorageReference
    expiresInSeconds: number
  }): Promise<SignedStorageOperation> {
    return {
      provider: this.provider,
      bucket: input.reference.bucket,
      key: input.reference.key,
      url: presign('GET', input.reference.bucket, input.reference.key, input.expiresInSeconds),
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
    }
  }
}
