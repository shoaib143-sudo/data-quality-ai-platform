import {
  SemanticProjectionRetrievalProvider,
  type RetrievalProvider,
} from './retrieval-provider'
import { createGovernanceEmbeddingProvider } from './governance-embedding-provider'
import {
  semanticSearchByEmbedding,
  type SemanticObjectType,
} from '@/lib/governance/semantic-search'

type SupabaseLike = Parameters<typeof semanticSearchByEmbedding>[0]

export function createGovernanceRetrievalProvider(supabase: SupabaseLike): RetrievalProvider {
  const embeddingProvider = createGovernanceEmbeddingProvider()

  return new SemanticProjectionRetrievalProvider({
    embedQuery: async (query) => (await embeddingProvider.embed({ input: query, purpose: 'query' })).embedding,
    searchProject: async ({ projectId, embedding, objectTypes, threshold, limit }) => semanticSearchByEmbedding(supabase, {
      projectId,
      embedding,
      objectTypes: objectTypes as SemanticObjectType[] | null | undefined,
      threshold,
      limit,
    }),
  })
}
