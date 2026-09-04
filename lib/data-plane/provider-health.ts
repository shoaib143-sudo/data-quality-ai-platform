import { getDataPlaneProviderSelection } from '@/lib/data-plane/provider-selection'
import { providerFetch, providerHealthCheck } from '@/lib/data-plane/provider-runtime'
import { openSearchRequest } from '@/lib/data-plane/providers/opensearch-http'
import { createAdminClient } from '@/lib/supabase/admin'

export type DataPlaneProviderHealth = {
  capability: 'knowledgeSearch' | 'graph' | 'analytics' | 'objectStore'
  providerKey: string
  selected: boolean
  configured: boolean
  healthy: boolean
  status: 'HEALTHY' | 'DEGRADED' | 'UNAVAILABLE'
  latencyMs: number
  fallbackProvider?: string
  detail?: string
}

function requireClickHouseConfig() {
  const endpoint = process.env.CLICKHOUSE_ENDPOINT?.trim()
  const user = process.env.CLICKHOUSE_USER?.trim()
  const password = process.env.CLICKHOUSE_PASSWORD
  const database = (process.env.CLICKHOUSE_DATABASE ?? 'datanexus').trim()
  if (!endpoint || !user || password == null) {
    throw new Error('ClickHouse connection is not fully configured')
  }
  return { endpoint: endpoint.replace(/\/$/, ''), user, password, database }
}

async function clickHouseHealth() {
  const config = requireClickHouseConfig()
  const url = new URL(config.endpoint)
  url.searchParams.set('database', config.database)
  url.searchParams.set('query', 'SELECT 1 FORMAT TabSeparated')
  return providerFetch(url, {
    method: 'POST',
    headers: {
      'x-clickhouse-user': config.user,
      'x-clickhouse-key': config.password,
    },
    cache: 'no-store',
  }, { providerKey: 'clickhouse' })
}

async function postgresHealth() {
  return providerHealthCheck('postgres', async () => {
    const admin = createAdminClient()
    const { error } = await admin.schema('orchestration').from('projection_checkpoints').select('consumer_key').limit(1)
    if (error) throw new Error(error.message)
    return true
  })
}

async function supabaseStorageHealth() {
  return providerHealthCheck('supabase', async () => {
    const admin = createAdminClient()
    const bucket = (process.env.SUPABASE_OBJECT_STORE_BUCKET ?? 'governance-artifacts').trim()
    const { error } = await admin.storage.getBucket(bucket)
    if (error) throw new Error(error.message)
    return true
  })
}

function row(
  capability: DataPlaneProviderHealth['capability'],
  providerKey: string,
  health: { healthy: boolean; latencyMs: number; detail?: string },
  options: { configured?: boolean; fallbackProvider?: string; unavailable?: boolean } = {},
): DataPlaneProviderHealth {
  const configured = options.configured ?? true
  const status: DataPlaneProviderHealth['status'] = health.healthy
    ? 'HEALTHY'
    : options.unavailable || !configured
      ? 'UNAVAILABLE'
      : options.fallbackProvider
        ? 'DEGRADED'
        : 'UNAVAILABLE'
  return {
    capability,
    providerKey,
    selected: true,
    configured,
    healthy: health.healthy,
    status,
    latencyMs: health.latencyMs,
    ...(options.fallbackProvider ? { fallbackProvider: options.fallbackProvider } : {}),
    ...(health.detail ? { detail: health.detail.slice(0, 500) } : {}),
  }
}

export async function getDataPlaneProviderHealth(): Promise<{
  selection: ReturnType<typeof getDataPlaneProviderSelection>
  providers: DataPlaneProviderHealth[]
  healthy: boolean
  degraded: boolean
}> {
  const selection = getDataPlaneProviderSelection()
  const postgresNeeded = selection.knowledgeSearch === 'postgres' || selection.graph === 'postgres' || selection.analytics === 'postgres'

  const [postgres, storage] = await Promise.all([
    postgresNeeded ? postgresHealth() : Promise.resolve(null),
    selection.objectStore === 'supabase' ? supabaseStorageHealth() : Promise.resolve(null),
  ])

  const providers: DataPlaneProviderHealth[] = []

  if (selection.knowledgeSearch === 'opensearch') {
    const configured = Boolean(process.env.OPENSEARCH_ENDPOINT?.trim())
    const health = configured
      ? await providerHealthCheck('opensearch', () => openSearchRequest('/_cluster/health?local=true', { method: 'GET' }))
      : { providerKey: 'opensearch', healthy: false, latencyMs: 0, detail: 'OpenSearch endpoint is not configured' }
    providers.push(row('knowledgeSearch', 'opensearch', health, { configured, fallbackProvider: 'postgres' }))
  } else {
    providers.push(row('knowledgeSearch', 'postgres', postgres ?? { healthy: false, latencyMs: 0, detail: 'PostgreSQL health probe was not executed' }))
  }

  if (selection.graph === 'postgres') {
    providers.push(row('graph', 'postgres', postgres ?? { healthy: false, latencyMs: 0, detail: 'PostgreSQL health probe was not executed' }))
  } else {
    providers.push(row('graph', selection.graph, {
      healthy: false,
      latencyMs: 0,
      detail: `${selection.graph} graph provider is selected but no implementation is configured`,
    }, { configured: false, unavailable: true }))
  }

  if (selection.analytics === 'clickhouse') {
    const configured = Boolean(process.env.CLICKHOUSE_ENDPOINT?.trim() && process.env.CLICKHOUSE_USER?.trim() && process.env.CLICKHOUSE_PASSWORD != null)
    const health = configured
      ? await providerHealthCheck('clickhouse', clickHouseHealth)
      : { providerKey: 'clickhouse', healthy: false, latencyMs: 0, detail: 'ClickHouse connection is not fully configured' }
    providers.push(row('analytics', 'clickhouse', health, { configured, fallbackProvider: 'postgres' }))
  } else {
    providers.push(row('analytics', 'postgres', postgres ?? { healthy: false, latencyMs: 0, detail: 'PostgreSQL health probe was not executed' }))
  }

  if (selection.objectStore === 'supabase') {
    providers.push(row('objectStore', 'supabase', storage ?? { healthy: false, latencyMs: 0, detail: 'Supabase Storage health probe was not executed' }))
  } else {
    providers.push(row('objectStore', selection.objectStore, {
      healthy: false,
      latencyMs: 0,
      detail: `${selection.objectStore} object store is selected but no implementation is configured`,
    }, { configured: false, unavailable: true }))
  }

  return {
    selection,
    providers,
    healthy: providers.every((provider) => provider.healthy),
    degraded: providers.some((provider) => provider.status === 'DEGRADED'),
  }
}
