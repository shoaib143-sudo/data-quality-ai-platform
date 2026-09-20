import { Container } from '@cloudflare/containers'
import { env } from 'cloudflare:workers'

function definedEnvVars(values: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string' && value.length > 0) result[name] = value
  }
  return result
}

const READ_ONLY_METHODS = new Set(['GET', 'HEAD'])

const ALLOWED_PATHS = new Set([
  '/api/health/live',
  '/api/build-info',
  '/api/jobs/worker',
])

export class DataNexusWorkerContainer extends Container {
  defaultPort = 3000
  sleepAfter = '10m'
  pingEndpoint = 'container/api/health/live'
  envVars = definedEnvVars({
    DATANEXUS_ENV: 'canary',
    DATANEXUS_PLATFORM: 'cloudflare',
    DATANEXUS_COMMIT_SHA: env.DATANEXUS_COMMIT_SHA,
    DATANEXUS_RELEASE_ID: env.DATANEXUS_RELEASE_ID,
    DATANEXUS_BUILD_TIMESTAMP: env.DATANEXUS_BUILD_TIMESTAMP,
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: env.DATANEXUS_WORKER_SECRET,
  })
}

function workerRuntimeConfigured() {
  return Boolean(
    env.DATANEXUS_WORKER_SECRET?.trim()
    && env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    && env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    && env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim(),
  )
}

export default {
  async fetch(request: Request, bindings: { DATANEXUS_WORKER: DurableObjectNamespace<DataNexusWorkerContainer> }) {
    const url = new URL(request.url)
    if (!ALLOWED_PATHS.has(url.pathname)) {
      return Response.json({ error: 'Route is not exposed by the DataNexus worker runtime.' }, { status: 404 })
    }

    if (url.pathname === '/api/jobs/worker') {
      if (request.method.toUpperCase() !== 'POST') {
        return Response.json({ error: 'Worker execution only accepts POST.' }, {
          status: 405,
          headers: { Allow: 'POST' },
        })
      }
      if (env.DATANEXUS_WORKER_EXECUTION_ENABLED !== 'true') {
        return Response.json({
          error: 'Worker execution is disabled on this runtime.',
          environment: 'canary',
        }, { status: 503 })
      }
      if (!workerRuntimeConfigured()) {
        return Response.json({
          error: 'Worker execution is enabled but required runtime secrets are incomplete.',
          environment: 'canary',
        }, { status: 503 })
      }
    } else if (!READ_ONLY_METHODS.has(request.method.toUpperCase())) {
      return Response.json({ error: 'Worker health and build routes are read-only.' }, {
        status: 405,
        headers: { Allow: 'GET, HEAD' },
      })
    }

    const container = bindings.DATANEXUS_WORKER.getByName('worker')
    return container.fetch(request)
  },
}
