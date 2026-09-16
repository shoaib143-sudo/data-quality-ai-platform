import { createHash, createHmac } from 'node:crypto'

const REGION = 'auto'
const SERVICE = 's3'
const ALGORITHM = 'AWS4-HMAC-SHA256'

export type R2CorsRule = {
  allowedOrigins: string[]
  allowedMethods: Array<'GET' | 'PUT' | 'HEAD'>
  allowedHeaders: string[]
  exposeHeaders: string[]
  maxAgeSeconds: number
}

export const DATANEXUS_R2_CORS_RULES: R2CorsRule[] = [{
  allowedOrigins: [
    'https://data-quality-ai-platform.vercel.app',
    'https://data-quality-ai-platform-git-r2-prereq-ha-4e83b5-shoaib143-sudo.vercel.app',
  ],
  allowedMethods: ['GET', 'PUT', 'HEAD'],
  allowedHeaders: ['Content-Type'],
  exposeHeaders: ['ETag', 'Content-Length'],
  maxAgeSeconds: 3600,
}]

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required R2 configuration: ${name}`)
  return value
}

function sha256(value: string | Buffer) {
  return createHash('sha256').update(value).digest('hex')
}

function hmac(key: string | Buffer, value: string) {
  return createHmac('sha256', key).update(value).digest()
}

function signingKey(secret: string, date: string) {
  return hmac(hmac(hmac(hmac(`AWS4${secret}`, date), REGION), SERVICE), 'aws4_request')
}

function amzDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '')
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function hasTag(xml: string, tag: string, value: string) {
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`<${tag}>\\s*${escaped}\\s*</${tag}>`, 'i').test(xml)
}

export function r2CorsHasWildcardOrigin(xml: string) {
  return hasTag(xml, 'AllowedOrigin', '*')
}

export function r2CorsPolicyMatchesDesired(xml: string, rules = DATANEXUS_R2_CORS_RULES) {
  if (r2CorsHasWildcardOrigin(xml)) return false
  return rules.every((rule) =>
    rule.allowedOrigins.every((value) => hasTag(xml, 'AllowedOrigin', value))
    && rule.allowedMethods.every((value) => hasTag(xml, 'AllowedMethod', value))
    && rule.allowedHeaders.every((value) => hasTag(xml, 'AllowedHeader', value))
    && rule.exposeHeaders.every((value) => hasTag(xml, 'ExposeHeader', value))
    && hasTag(xml, 'MaxAgeSeconds', String(rule.maxAgeSeconds)),
  )
}

export function corsPolicyXml(rules = DATANEXUS_R2_CORS_RULES) {
  const body = rules.map((rule) => [
    '<CORSRule>',
    ...rule.allowedOrigins.map((value) => `<AllowedOrigin>${escapeXml(value)}</AllowedOrigin>`),
    ...rule.allowedMethods.map((value) => `<AllowedMethod>${value}</AllowedMethod>`),
    ...rule.allowedHeaders.map((value) => `<AllowedHeader>${escapeXml(value)}</AllowedHeader>`),
    ...rule.exposeHeaders.map((value) => `<ExposeHeader>${escapeXml(value)}</ExposeHeader>`),
    `<MaxAgeSeconds>${Math.max(0, Math.floor(rule.maxAgeSeconds))}</MaxAgeSeconds>`,
    '</CORSRule>',
  ].join('')).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><CORSConfiguration xmlns="http://s3.amazonaws.com/doc/2006-03-01/">${body}</CORSConfiguration>`
}

function runtimeConfig() {
  const accountId = required('R2_ACCOUNT_ID')
  const endpoint = new URL(required('R2_ENDPOINT'))
  const expectedHost = `${accountId}.r2.cloudflarestorage.com`
  if (endpoint.protocol !== 'https:' || endpoint.hostname !== expectedHost) {
    throw new Error('R2_ENDPOINT does not match the configured R2 account.')
  }
  return {
    accessKeyId: required('R2_ACCESS_KEY_ID'),
    secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
    bucket: required('R2_BUCKET'),
    endpoint,
  }
}

async function signedCorsRequest(method: 'GET' | 'PUT', body?: string) {
  const { accessKeyId, secretAccessKey, bucket, endpoint } = runtimeConfig()
  const now = new Date()
  const amz = amzDate(now)
  const date = amz.slice(0, 8)
  const scope = `${date}/${REGION}/${SERVICE}/aws4_request`
  const payload = body ?? ''
  const payloadDigest = sha256(payload)
  const path = `/${encodeURIComponent(bucket)}`
  const canonicalQuery = 'cors='
  const headers: Record<string, string> = {
    host: endpoint.host,
    'x-amz-content-sha256': payloadDigest,
    'x-amz-date': amz,
  }
  if (method === 'PUT') headers['content-type'] = 'application/xml'
  const names = Object.keys(headers).sort()
  const canonicalHeaders = names.map((name) => `${name}:${headers[name]}\n`).join('')
  const canonicalRequest = [method, path, canonicalQuery, canonicalHeaders, names.join(';'), payloadDigest].join('\n')
  const stringToSign = [ALGORITHM, amz, scope, sha256(canonicalRequest)].join('\n')
  const signature = createHmac('sha256', signingKey(secretAccessKey, date)).update(stringToSign).digest('hex')
  const authorization = `${ALGORITHM} Credential=${accessKeyId}/${scope}, SignedHeaders=${names.join(';')}, Signature=${signature}`
  const url = new URL(endpoint.toString())
  url.pathname = path
  url.search = canonicalQuery
  const requestHeaders = new Headers(headers)
  requestHeaders.set('authorization', authorization)
  requestHeaders.delete('host')
  return fetch(url, { method, headers: requestHeaders, body: method === 'PUT' ? payload : undefined })
}

export async function applyDataNexusR2CorsPolicy() {
  const response = await signedCorsRequest('PUT', corsPolicyXml())
  if (!response.ok) throw new Error(`R2 PutBucketCors failed with status ${response.status}.`)
}

export async function readR2CorsPolicy() {
  const response = await signedCorsRequest('GET')
  if (!response.ok) throw new Error(`R2 GetBucketCors failed with status ${response.status}.`)
  return response.text()
}
