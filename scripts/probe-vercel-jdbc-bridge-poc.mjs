import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'

const baseUrl = process.env.VERCEL_JDBC_BRIDGE_URL?.replace(/\/$/, '')
const maxHealthMs = Number(process.env.VERCEL_JDBC_BRIDGE_MAX_HEALTH_MS ?? 5000)
const protectionBypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET?.trim() ?? ''
if (!baseUrl) throw new Error('VERCEL_JDBC_BRIDGE_URL is required for live PoC probing.')
if (!Number.isFinite(maxHealthMs) || maxHealthMs < 100) throw new Error('VERCEL_JDBC_BRIDGE_MAX_HEALTH_MS must be a number >= 100.')

async function timedFetch(url, init = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), Math.max(maxHealthMs + 1000, 2000))
  const started = performance.now()
  try {
    const headers = new Headers(init.headers)
    if (protectionBypass) {
      headers.set('x-vercel-protection-bypass', protectionBypass)
      headers.set('x-vercel-set-bypass-cookie', 'true')
    }
    const response = await fetch(url, { ...init, headers, signal: controller.signal, cache: 'no-store' })
    return { response, elapsedMs: Math.round(performance.now() - started) }
  } finally {
    clearTimeout(timeout)
  }
}

const health = await timedFetch(`${baseUrl}/health`)
assert.equal(health.response.status, 200, 'JDBC PoC /health must return HTTP 200')
const healthBody = await health.response.json()
assert.equal(healthBody.status, 'ok')
assert.equal(healthBody.service, 'datanexus-jdbc-bridge')
assert.ok(Array.isArray(healthBody.supported_engines) && healthBody.supported_engines.length >= 10)
assert.ok(health.elapsedMs <= maxHealthMs, `JDBC PoC health latency ${health.elapsedMs}ms exceeded ${maxHealthMs}ms`)

const root = await timedFetch(`${baseUrl}/`)
assert.equal(root.response.status, 200, 'JDBC PoC root status must remain public')

const unauth = await timedFetch(`${baseUrl}/v1/query`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({}),
})
assert.equal(unauth.response.status, 401, 'JDBC PoC protected API must fail closed without bearer token')

console.log(JSON.stringify({
  status: 'PASS',
  baseUrl,
  healthLatencyMs: health.elapsedMs,
  maxHealthMs,
  engines: healthBody.supported_engines.length,
  unauthenticatedQueryStatus: unauth.response.status,
  deploymentProtectionBypassConfigured: Boolean(protectionBypass),
}, null, 2))
