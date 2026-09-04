import type { TenantScope } from '@/lib/data-plane/contracts'
import { getDataPlaneProviderSelection } from '@/lib/data-plane/provider-selection'
import { OpenSearchKnowledgeProjectionSink } from '@/lib/data-plane/providers/opensearch-knowledge-projection-sink'
import { runProjectionBatch } from '@/lib/data-plane/run-projection-batch'

let sink: OpenSearchKnowledgeProjectionSink | null = null

export async function runKnowledgeProjectionBatch(scope: TenantScope, limit = 200) {
  const { knowledgeSearch } = getDataPlaneProviderSelection()
  if (knowledgeSearch !== 'opensearch') {
    return { processed: 0, checkpoint: null, paused: false, skipped: true }
  }

  sink ??= new OpenSearchKnowledgeProjectionSink()
  const result = await runProjectionBatch({
    ...scope,
    consumerKey: 'knowledge:opensearch',
    providerKey: 'opensearch',
    projectionName: 'knowledge',
    limit,
    handle: async (events) => {
      await sink!.apply(events.map(({ event }) => event))
    },
  })
  return { ...result, skipped: false }
}
