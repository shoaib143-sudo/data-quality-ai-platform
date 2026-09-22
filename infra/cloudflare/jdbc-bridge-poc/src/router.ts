import { Container } from '@cloudflare/containers'
import { env } from 'cloudflare:workers'

function definedEnvVars(values: Record<string, string | undefined>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [name, value] of Object.entries(values)) {
    if (typeof value === 'string' && value.trim().length > 0) result[name] = value
  }
  return result
}

const PUBLIC_READ_PATHS = new Set(['/', '/health'])
const PROTECTED_POST_PATHS = new Set([
  '/v1/credentials',
  '/v1/catalog',
  '/v1/validate',
  '/v1/query',
  '/v1/lineage',
])

function bridgeToken(): string {
  return env.JDBC_BRIDGE_TOKEN?.trim() ?? ''
}

export class DataNexusJdbcBridgeContainer extends Container {
  defaultPort = 10000
  sleepAfter = '30m'
  pingEndpoint = 'container/health'
  envVars = definedEnvVars({
    JDBC_BRIDGE_TOKEN: env.JDBC_BRIDGE_TOKEN,
    INFISICAL_API_URL: env.INFISICAL_API_URL,
    INFISICAL_AUTH_URL: env.INFISICAL_AUTH_URL,
    INFISICAL_PROJECT_ID: env.INFISICAL_PROJECT_ID,
    INFISICAL_ENVIRONMENT: env.INFISICAL_ENVIRONMENT,
    INFISICAL_SECRET_PATH: env.INFISICAL_SECRET_PATH,
    INFISICAL_CLIENT_ID: env.INFISICAL_CLIENT_ID,
    INFISICAL_CLIENT_SECRET: env.INFISICAL_CLIENT_SECRET,
    JDBC_CREDENTIAL_MODE: env.JDBC_CREDENTIAL_MODE,
  })
}

export default {
  async fetch(
    request: Request,
    bindings: { DATANEXUS_JDBC_BRIDGE: DurableObjectNamespace<DataNexusJdbcBridgeContainer> },
  ) {
    const url = new URL(request.url)
    const method = request.method.toUpperCase()

    if (PUBLIC_READ_PATHS.has(url.pathname)) {
      if (method !== 'GET' && method !== 'HEAD') {
        return Response.json({ error: 'Public JDBC bridge routes are read-only.' }, {
          status: 405,
          headers: { Allow: 'GET, HEAD' },
        })
      }
      return bindings.DATANEXUS_JDBC_BRIDGE.getByName('bridge').fetch(request)
    }

    if (!PROTECTED_POST_PATHS.has(url.pathname)) {
      return Response.json({ error: 'Route is not exposed by the DataNexus JDBC bridge PoC.' }, { status: 404 })
    }

    if (method !== 'POST') {
      return Response.json({ error: 'Protected JDBC bridge routes only accept POST.' }, {
        status: 405,
        headers: { Allow: 'POST' },
      })
    }

    if (env.DATANEXUS_JDBC_EXECUTION_ENABLED !== 'true') {
      return Response.json({
        error: 'JDBC execution is disabled on this Cloudflare PoC.',
        environment: 'canary',
      }, { status: 503 })
    }

    const expectedToken = bridgeToken()
    if (!expectedToken) {
      return Response.json({
        error: 'JDBC execution is enabled but the bridge token is not configured.',
        environment: 'canary',
      }, { status: 503 })
    }

    if (request.headers.get('authorization')?.trim() !== 'Bearer ' + expectedToken) {
      return Response.json({
        error: 'JDBC bridge access denied.',
        environment: 'canary',
      }, { status: 401 })
    }

    return bindings.DATANEXUS_JDBC_BRIDGE.getByName('bridge').fetch(request)
  },
}
