import type { AnalyticsEventProvider } from '@/lib/data-plane/contracts'
import { getDataPlaneProviderSelection } from '@/lib/data-plane/provider-selection'
import { ClickHouseAnalyticsEventProvider } from '@/lib/data-plane/providers/clickhouse-analytics-event-provider'
import { PostgresAnalyticsEventProvider } from '@/lib/data-plane/providers/postgres-analytics-event-provider'

let postgresProvider: AnalyticsEventProvider | null = null
let clickHouseProvider: AnalyticsEventProvider | null = null

export function getAnalyticsEventProvider(): AnalyticsEventProvider {
  const { analytics } = getDataPlaneProviderSelection()
  if (analytics === 'postgres') {
    postgresProvider ??= new PostgresAnalyticsEventProvider()
    return postgresProvider
  }
  if (analytics === 'clickhouse') {
    clickHouseProvider ??= new ClickHouseAnalyticsEventProvider()
    return clickHouseProvider
  }
  throw new Error(`Unsupported analytics provider: ${analytics}`)
}
