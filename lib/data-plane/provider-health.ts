import { getDataPlaneProviderSelection } from '@/lib/data-plane/provider-selection'
import { providerFetch, providerHealthCheck } from '@/lib/data-plane/provider-runtime'
import { openSearchRequest } from '@/lib/data-plane/providers/opensearch-http'

export type DataPlaneProviderHealth = {
  capability: 'knowledgeSearch' | 'graph' | 'analytics' | 'objectStore'
  providerKey: string
  selected: boolean
  healthy: boolean
  latencyMs: number
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

function healthyBuiltIn(capability: DataPlaneProviderHealth['capability'], providerKey: string, detail: string): DataPlaneProviderHealth {
  return { capability, providerKey, selected: true, healthy: true, latencyMs: 0, detail }
}

export async function getDataPlaneProviderHealth(): Promise<{
  selection: ReturnType<typeof getDataPlaneProviderSelection>
  providers: DataPlaneProviderHealth[]
  healthy: boolean
}> {
  const selection = getDataPlaneProviderSelection()
  const providers: DataPlaneProviderHealth[] = []

  if (selection.knowledgeSearch === 'opensearch') {
    const health = await providerHealthCheck('opensearch', () => openSearchRequest('/_cluster/health?local=true', { method: 'GET' }))
    providers.push({ capability: 'knowledgeSearch', selected: true, ...health })
  } else {
    providers.push(healthyBuiltIn('knowledgeSearch', 'postgres', 'PostgreSQL knowledge-search fallback is selected'))
  }

  if (selection.graph === 'postgres') {
    providers.push(healthyBuiltIn('graph', 'postgres', 'PostgreSQL GraphProvider is selected'))
  } else {
    providers.push({ capability: 'graph', providerKey: selection.graph, selected: true, healthy: false, latencyMs: 0, detail: `${selection.graph} graph provider is selected but no implementation is configured` })
  }

  if (selection.analytics === 'clickhouse') {
    const health = await providerHealthCheck('clickhouse', clickHouseHealth)
    providers.push({ capability: 'analytics', selected: true, ...health })
  } else {
    providers.push(healthyBuiltIn('analytics', 'postgres', 'PostgreSQL analytics fallback is selected'))
  }

  if (selection.objectStore === 'supabase') {
    providers.push(healthyBuiltIn('objectStore', 'supabase', 'Supabase private object storage is selected'))
  } else {
    providers.push({ capability: 'objectStore', providerKey: selection.objectStore, selected: true, healthy: false, latencyMs: 0, detail: `${selection.objectStore} object store is selected but no implementation is configured` })
  }

  return {
    selection,
    providers,
    healthy: providers.every((provider) => provider.healthy),
  }
}
