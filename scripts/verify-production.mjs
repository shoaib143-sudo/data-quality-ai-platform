const baseUrl = (process.env.PRODUCTION_URL || 'https://data-quality-ai-platform.vercel.app').replace(/\/$/, '')

async function check(path, expected) {
  const response = await fetch(`${baseUrl}${path}`, { redirect: 'manual' })
  if (!expected(response)) throw new Error(`${path} returned unexpected HTTP ${response.status}`)
  console.log(`PASS ${path} -> ${response.status}`)
}

await check('/login', (response) => response.status >= 200 && response.status < 400)
await check('/api/profiling/run', (response) => [401, 403, 405].includes(response.status))
await check('/api/profiling/validate', (response) => [401, 403, 405].includes(response.status))
await check('/api/datasets/register', (response) => [401, 403, 405].includes(response.status))
await check('/api/agents/run', (response) => [401, 403, 405].includes(response.status))

if (process.env.VERIFY_COOKIE && process.env.VERIFY_PROFILE_RUN_ID) {
  const response = await fetch(`${baseUrl}/api/profiling/validate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: process.env.VERIFY_COOKIE },
    body: JSON.stringify({ profilingRunId: process.env.VERIFY_PROFILE_RUN_ID }),
  })
  if (!response.ok) throw new Error(`Authenticated profiling validation failed with HTTP ${response.status}`)
  const result = await response.json()
  if (result.valid === false) throw new Error(`Profiling contract validation failed: ${JSON.stringify(result)}`)
  console.log('PASS authenticated profiling contract validation')
}

console.log('Production dependency-aware smoke verification completed.')
