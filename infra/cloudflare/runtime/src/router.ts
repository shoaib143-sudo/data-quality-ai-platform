import { Container } from '@cloudflare/containers'
import { env } from 'cloudflare:workers'

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
  envVars = {
    DATANEXUS_ENV: 'canary',
    DATANEXUS_PLATFORM: 'cloudflare',
    DATANEXUS_COMMIT_SHA: env.DATANEXUS_COMMIT_SHA,
    DATANEXUS_RELEASE_ID: env.DATANEXUS_RELEASE_ID,
    DATANEXUS_BUILD_TIMESTAMP: env.DATANEXUS_BUILD_TIMESTAMP,
  }
}

export default {
  async fetch(request: Request, bindings: { DATANEXUS_CANARY: DurableObjectNamespace<DataNexusCanary> }) {
    const url = new URL(request.url)

    if (BLOCKED_CANARY_PATHS.has(url.pathname)) {
      return Response.json({
        error: 'This operation is disabled on the DataNexus canary runtime.',
        environment: 'canary',
      }, { status: 403 })
    }

    const container = bindings.DATANEXUS_CANARY.getByName('web')
    return container.fetch(request)
  },
}
