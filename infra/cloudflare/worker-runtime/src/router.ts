import { Container } from '@cloudflare/containers'
import { env } from 'cloudflare:workers'

const ALLOWED_PATHS = new Set([
  '/api/health/live',
  '/api/build-info',
  '/api/jobs/worker',
])

export class DataNexusWorkerContainer extends Container {
  defaultPort = 3000
  sleepAfter = '10m'
  envVars = {
    DATANEXUS_ENV: 'canary',
    DATANEXUS_PLATFORM: 'cloudflare',
    DATANEXUS_COMMIT_SHA: env.DATANEXUS_COMMIT_SHA,
    DATANEXUS_RELEASE_ID: env.DATANEXUS_RELEASE_ID,
    DATANEXUS_BUILD_TIMESTAMP: env.DATANEXUS_BUILD_TIMESTAMP,
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    SUPABASE_SERVICE_ROLE_KEY: env.SUPABASE_SERVICE_ROLE_KEY,
    CRON_SECRET: env.DATANEXUS_WORKER_SECRET,
  }
}

export default {
  async fetch(request: Request, bindings: { DATANEXUS_WORKER: DurableObjectNamespace<DataNexusWorkerContainer> }) {
    const url = new URL(request.url)
    if (!ALLOWED_PATHS.has(url.pathname)) {
      return Response.json({ error: 'Route is not exposed by the DataNexus worker runtime.' }, { status: 404 })
    }

    if (url.pathname === '/api/jobs/worker' && env.DATANEXUS_WORKER_EXECUTION_ENABLED !== 'true') {
      return Response.json({
        error: 'Worker execution is disabled on this runtime.',
        environment: 'canary',
      }, { status: 503 })
    }

    const container = bindings.DATANEXUS_WORKER.getByName('worker')
    return container.fetch(request)
  },
}
