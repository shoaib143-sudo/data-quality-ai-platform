import type { AnalyticsQueryProvider, AnalyticsQueryRequest, AnalyticsQueryRow } from '@/lib/data-plane/contracts'
import { getDataPlaneProviderSelection } from '@/lib/data-plane/provider-selection'
import { ClickHouseAnalyticsQueryProvider } from '@/lib/data-plane/providers/clickhouse-analytics-query-provider'
import { PostgresAnalyticsQueryProvider } from '@/lib/data-plane/providers/postgres-analytics-query-provider'
import { executeWithReadFallback } from '@/lib/data-plane/read-fallback'

let postgresProvider: AnalyticsQueryProvider | null = null
let clickhouseProvider: AnalyticsQueryProvider | null = null
let resilientClickhouseProvider: AnalyticsQueryProvider | null = null

function readFallbackEnabled() {
  return process.env.PROVIDER_READ_FALLBACK_ENABLED?.trim().toLowerCase() !== 'false'
}

class ClickHouseWithPostgresFallback implements AnalyticsQueryProvider {
  readonly providerKey = 'clickhouse+postgres-fallback'

  constructor(
    private readonly primary: AnalyticsQueryProvider,
    private readonly fallback: AnalyticsQueryProvider,
  ) {}

  async query(request: AnalyticsQueryRequest): Promise<AnalyticsQueryRow[]> {
    return executeWithReadFallback({
      primary: () => this.primary.query(request),
      fallback: () => this.fallback.query(request),
      fallbackEnabled: readFallbackEnabled(),
    })
  }
}

export function getAnalyticsQueryProvider(): AnalyticsQueryProvider {
  const { analytics } = getDataPlaneProviderSelection()
  postgresProvider ??= new PostgresAnalyticsQueryProvider()

  if (analytics === 'postgres') return postgresProvider

  if (analytics === 'clickhouse') {
    clickhouseProvider ??= new ClickHouseAnalyticsQueryProvider()
    if (!readFallbackEnabled()) return clickhouseProvider
    resilientClickhouseProvider ??= new ClickHouseWithPostgresFallback(clickhouseProvider, postgresProvider)
    return resilientClickhouseProvider
  }

  throw new Error(`ANALYTICS_PROVIDER=${analytics} is selected but no analytics query provider implementation is configured.`)
}
