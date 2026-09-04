import type { KnowledgeSearchProvider, KnowledgeSearchRequest, KnowledgeSearchResponse } from '@/lib/data-plane/contracts'
import { getDataPlaneProviderSelection } from '@/lib/data-plane/provider-selection'
import { OpenSearchKnowledgeSearchProvider } from '@/lib/data-plane/providers/opensearch-knowledge-search-provider'
import { PostgresKnowledgeSearchProvider } from '@/lib/data-plane/providers/postgres-knowledge-search-provider'

let postgresProvider: KnowledgeSearchProvider | null = null
let openSearchProvider: KnowledgeSearchProvider | null = null
let resilientOpenSearchProvider: KnowledgeSearchProvider | null = null

function readFallbackEnabled() {
  return process.env.PROVIDER_READ_FALLBACK_ENABLED?.trim().toLowerCase() !== 'false'
}

class OpenSearchWithPostgresFallback implements KnowledgeSearchProvider {
  readonly providerKey = 'opensearch+postgres-fallback'

  constructor(
    private readonly primary: KnowledgeSearchProvider,
    private readonly fallback: KnowledgeSearchProvider,
  ) {}

  async search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
    try {
      return await this.primary.search(request)
    } catch (primaryError) {
      if (!readFallbackEnabled()) throw primaryError
      const response = await this.fallback.search(request)
      return {
        ...response,
        semanticStatus: request.semantic ? 'UNAVAILABLE' : response.semanticStatus,
      }
    }
  }
}

export function getKnowledgeSearchProvider(): KnowledgeSearchProvider {
  const { knowledgeSearch } = getDataPlaneProviderSelection()
  postgresProvider ??= new PostgresKnowledgeSearchProvider()

  if (knowledgeSearch === 'postgres') return postgresProvider

  if (knowledgeSearch === 'opensearch') {
    openSearchProvider ??= new OpenSearchKnowledgeSearchProvider()
    if (!readFallbackEnabled()) return openSearchProvider
    resilientOpenSearchProvider ??= new OpenSearchWithPostgresFallback(openSearchProvider, postgresProvider)
    return resilientOpenSearchProvider
  }

  throw new Error(`Unsupported knowledge search provider: ${knowledgeSearch}`)
}
