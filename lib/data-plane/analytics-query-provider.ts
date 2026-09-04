import type { AnalyticsQueryProvider } from '@/lib/data-plane/contracts'
import { getDataPlaneProviderSelection } from '@/lib/data-plane/provider-selection'
import { ClickHouseAnalyticsQueryProvider } from '@/lib/data-plane/providers/clickhouse-analytics-query-provider'
import { PostgresAnalyticsQueryProvider } from '@/lib/data-plane/providers/postgres-analytics-query-provider'

let postgresProvider: AnalyticsQueryProvider | null = null
let clickhouseProvider: AnalyticsQueryProvider | null = null

export function getAnalyticsQueryProvider(): AnalyticsQueryProvider {
  const { analytics } = getDataPlaneProviderSelection()
  if (analytics === 'postgres') {
    postgresProvider ??= new PostgresAnalyticsQueryProvider()
    return postgresProvider
  }
  if (analytics === 'clickhouse') {
    clickhouseProvider ??= new ClickHouseAnalyticsQueryProvider()
    return clickhouseProvider
  }
  throw new Error(`ANALYTICS_PROVIDER=${analytics} is selected but no analytics query provider implementation is configured.`)
}
