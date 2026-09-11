import http from 'node:http'
import { createHash } from 'node:crypto'

const port = Number.parseInt(process.env.PORT || '', 10)
const collectorPort = Number.parseInt(process.env.OTLP_COLLECTOR_PORT || '4318', 10)
const verifyUrl = (process.env.OTLP_AUTH_VERIFY_URL || 'https://data-quality-ai-platform.vercel.app/api/internal/observability/otlp-auth').trim()
const maxBodyBytes = Number.parseInt(process.env.OTLP_MAX_BODY_BYTES || String(2 * 1024 * 1024), 10)
const cacheTtlMs = Number.parseInt(process.env.OTLP_AUTH_CACHE_TTL_MS || '60000', 10)

if (!Number.isFinite(port) || port <= 0) throw new Error('PORT is required')
if (!Number.isFinite(collectorPort) || collectorPort <= 0) throw new Error('OTLP_COLLECTOR_PORT is invalid')
if (!/^https?:\/\//i.test(verifyUrl)) throw new Error('OTLP_AUTH_VERIFY_URL must be an HTTP(S) URL')

const verifiedDigests = new Map()

function digest(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function verifyAuthorization(authorization) {
  if (!authorization?.trim()) return false
  const cacheKey = digest(authorization)
  const cachedUntil = verifiedDigests.get(cacheKey) || 0
  if (cachedUntil > Date.now()) return true

  const response = await fetch(verifyUrl, {
    method: 'POST',
    headers: { authorization },
    signal: AbortSignal.timeout(3000),
    cache: 'no-store',
  })
  if (response.status === 204) {
    verifiedDigests.set(cacheKey, Date.now() + Math.max(0, cacheTtlMs))
    return true
  }
  if (response.status === 401 || response.status === 403) return false
  throw new Error(`OTLP authorization verifier returned HTTP ${response.status}`)
}

async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBodyBytes) throw Object.assign(new Error('OTLP request body too large'), { statusCode: 413 })
    chunks.push(chunk)
  }
  return Buffer.concat(chunks)
}

async function handleHealth(response) {
  try {
    const health = await fetch('http://127.0.0.1:13133/', { signal: AbortSignal.timeout(1000), cache: 'no-store' })
    response.writeHead(health.ok ? 200 : 503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify({ status: health.ok ? 'ok' : 'unavailable', service: 'datanexus-otel-collector' }))
  } catch {
    response.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    response.end(JSON.stringify({ status: 'unavailable', service: 'datanexus-otel-collector' }))
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'GET' && request.url === '/health') {
    await handleHealth(response)
    return
  }

  if (request.method !== 'POST' || request.url !== '/v1/traces') {
    response.writeHead(404, { 'cache-control': 'no-store' })
    response.end()
    return
  }

  try {
    const authorization = request.headers.authorization
    const authorized = await verifyAuthorization(authorization)
    if (!authorized) {
      response.writeHead(401, { 'cache-control': 'no-store' })
      response.end()
      return
    }

    const body = await readBody(request)
    const upstream = await fetch(`http://127.0.0.1:${collectorPort}/v1/traces`, {
      method: 'POST',
      headers: { 'content-type': request.headers['content-type'] || 'application/json' },
      body,
      signal: AbortSignal.timeout(5000),
      cache: 'no-store',
    })
    const upstreamBody = Buffer.from(await upstream.arrayBuffer())
    response.writeHead(upstream.status, {
      'content-type': upstream.headers.get('content-type') || 'application/json',
      'cache-control': 'no-store',
    })
    response.end(upstreamBody)
  } catch (error) {
    const statusCode = Number(error?.statusCode) || 503
    response.writeHead(statusCode, { 'cache-control': 'no-store' })
    response.end()
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`OTLP auth proxy listening on ${port}; collector loopback port ${collectorPort}`)
})
