import {
  SemanticProjectionRetrievalProvider,
  type RetrievalProvider,
} from './retrieval-provider'
import {
  DeterministicRelevanceReranker,
  RerankingRetrievalProvider,
} from './reranker-provider'
import { createGovernanceEmbeddingProvider } from './governance-embedding-provider'
import {
  semanticSearchByEmbedding,
  type SemanticObjectType,
} from '@/lib/governance/semantic-search'

type SupabaseLike = Parameters<typeof semanticSearchByEmbedding>[0]

export function createGovernanceRetrievalProvider(supabase: SupabaseLike): RetrievalProvider {
  const embeddingProvider = createGovernanceEmbeddingProvider()
  const semanticProvider = new SemanticProjectionRetrievalProvider({
    embedQuery: async (query) => {
      const result = await embeddingProvider.embed({ input: query, purpose: 'query' })
      const embeddingSpaceId = result.embeddingSpaceId?.trim()
      if (!embeddingSpaceId) throw new Error('Governance embedding provider did not resolve an embedding space')
      return { embedding: result.embedding, embeddingSpaceId }
    },
    searchProject: async ({ projectId, embedding, embeddingSpaceId, objectTypes, threshold, limit }) => semanticSearchByEmbedding(supabase, {
      projectId,
      embedding,
      embeddingSpaceId,
      objectTypes: objectTypes as SemanticObjectType[] | null | undefined,
      threshold,
      limit,
    }),
  })

  return new RerankingRetrievalProvider(
    semanticProvider,
    new DeterministicRelevanceReranker(),
  )
}
