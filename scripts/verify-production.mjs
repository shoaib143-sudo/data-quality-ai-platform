const baseUrl = (process.env.PRODUCTION_URL || 'https://data-quality-ai-platform.vercel.app').replace(/\/$/, '')
const bridgeUrl = (process.env.JDBC_BRIDGE_URL || '').replace(/\/$/, '')
const timeoutMs = Number(process.env.VERIFY_TIMEOUT_MS || 15000)

async function request(url, options = {}) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, redirect: 'manual', signal: controller.signal })
  } finally {
    clearTimeout(timeout)
  }
}

async function check(path, expected) {
  const response = await request(`${baseUrl}${path}`)
  if (!expected(response)) throw new Error(`${path} returned unexpected HTTP ${response.status}`)
  console.log(`PASS ${path} -> ${response.status}`)
}

await check('/login', (response) => response.status >= 200 && response.status < 400)
await check('/api/profiling/run', (response) => [401, 403, 405].includes(response.status))
await check('/api/profiling/validate', (response) => [401, 403, 405].includes(response.status))
await check('/api/datasets/register', (response) => [401, 403, 405].includes(response.status))
await check('/api/agents/run', (response) => [401, 403, 405].includes(response.status))

if (bridgeUrl) {
  const response = await request(`${bridgeUrl}/health`)
  if (!response.ok) throw new Error(`JDBC bridge health check failed with HTTP ${response.status}`)
  console.log('PASS JDBC bridge health')

  const unauthorized = await request(`${bridgeUrl}/v1/query`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jdbcUrl: 'jdbc:postgresql://example.invalid/db',
      credentialRef: 'production-smoke',
      schema: 'public',
      table: 'customers',
      limit: 1,
    }),
  })
  if (unauthorized.status !== 401) throw new Error(`JDBC bridge unauthenticated boundary returned HTTP ${unauthorized.status}`)
  console.log('PASS JDBC bridge unauthenticated boundary -> 401')
}

if (process.env.VERIFY_COOKIE && process.env.VERIFY_PROFILE_RUN_ID) {
  const response = await request(`${baseUrl}/api/profiling/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: process.env.VERIFY_COOKIE },
    body: JSON.stringify({ profilingRunId: process.env.VERIFY_PROFILE_RUN_ID }),
  })
  if (!response.ok) throw new Error(`Authenticated profiling validation failed with HTTP ${response.status}`)
  const result = await response.json()
  if (result.valid === false) throw new Error('Profiling contract validation returned valid=false')
  console.log('PASS authenticated profiling contract validation')
}

console.log('Production dependency-aware smoke verification completed.')
