import type { KnowledgeSearchProvider } from '@/lib/data-plane/contracts'
import { getDataPlaneProviderSelection } from '@/lib/data-plane/provider-selection'
import { OpenSearchKnowledgeSearchProvider } from '@/lib/data-plane/providers/opensearch-knowledge-search-provider'
import { PostgresKnowledgeSearchProvider } from '@/lib/data-plane/providers/postgres-knowledge-search-provider'

let postgresProvider: KnowledgeSearchProvider | null = null
let openSearchProvider: KnowledgeSearchProvider | null = null

export function getKnowledgeSearchProvider(): KnowledgeSearchProvider {
  const { knowledgeSearch } = getDataPlaneProviderSelection()
  if (knowledgeSearch === 'postgres') {
    postgresProvider ??= new PostgresKnowledgeSearchProvider()
    return postgresProvider
  }
  if (knowledgeSearch === 'opensearch') {
    openSearchProvider ??= new OpenSearchKnowledgeSearchProvider()
    return openSearchProvider
  }
  throw new Error(`Unsupported knowledge search provider: ${knowledgeSearch}`)
}
