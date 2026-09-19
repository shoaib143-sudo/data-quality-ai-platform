import { Container } from '@cloudflare/containers'
import { env } from 'cloudflare:workers'

function definedEnvVars(values: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string' && value.length > 0) result[name] = value
  }
  return result
}

const READ_ONLY_CANARY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

const BLOCKED_CANARY_PATHS = new Set([
  '/api/jobs/worker',
  '/api/internal/storage/configure-r2-cors',
  '/api/internal/storage/migrate-to-r2',
  '/api/internal/storage/reference-cutover',
  '/api/internal/governance/approval-automation',
])

export class DataNexusCanary extends Container {
  defaultPort = 3000
  sleepAfter = '10m'
  pingEndpoint = '/api/health/live'
  envVars = definedEnvVars({
    DATANEXUS_ENV: 'canary',
    DATANEXUS_PLATFORM: 'cloudflare',
    DATANEXUS_COMMIT_SHA: env.DATANEXUS_COMMIT_SHA,
    DATANEXUS_RELEASE_ID: env.DATANEXUS_RELEASE_ID,
    DATANEXUS_BUILD_TIMESTAMP: env.DATANEXUS_BUILD_TIMESTAMP,
    NEXT_PUBLIC_SUPABASE_URL: env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  })
}

export default {
  async fetch(request: Request, bindings: { DATANEXUS_CANARY: DurableObjectNamespace<DataNexusCanary> }) {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/internal/') || BLOCKED_CANARY_PATHS.has(url.pathname)) {
      return Response.json({
        error: 'This operation is disabled on the DataNexus canary runtime.',
        environment: 'canary',
      }, { status: 403 })
    }

    if (!READ_ONLY_CANARY_METHODS.has(request.method.toUpperCase())) {
      return Response.json({
        error: 'The DataNexus canary runtime is read-only until mutation authority is explicitly certified.',
        environment: 'canary',
      }, { status: 403 })
    }

    const container = bindings.DATANEXUS_CANARY.getByName('web')
    return container.fetch(request)
  },
}
