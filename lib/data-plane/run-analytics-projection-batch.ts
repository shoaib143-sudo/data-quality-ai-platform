import type { TenantScope } from '@/lib/data-plane/contracts'
import { getAnalyticsEventProvider } from '@/lib/data-plane/analytics-event-provider'
import { runProjectionBatch } from '@/lib/data-plane/run-projection-batch'

export async function runAnalyticsProjectionBatch(scope: TenantScope, limit = 200) {
  const provider = getAnalyticsEventProvider()
  return runProjectionBatch({
    ...scope,
    consumerKey: `analytics:${provider.providerKey}`,
    providerKey: provider.providerKey,
    projectionName: 'analytics_events',
    limit,
    handle: async (events) => {
      await provider.publish(events.map(({ event }) => event))
    },
  })
}
