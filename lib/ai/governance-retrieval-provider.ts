import {
  SemanticProjectionRetrievalProvider,
  type RetrievalProvider,
} from './retrieval-provider'
import {
  embedGovernanceText,
  semanticSearchByEmbedding,
  type SemanticObjectType,
} from '@/lib/governance/semantic-search'

type SupabaseLike = Parameters<typeof semanticSearchByEmbedding>[0]

export function createGovernanceRetrievalProvider(supabase: SupabaseLike): RetrievalProvider {
  return new SemanticProjectionRetrievalProvider({
    embedQuery: embedGovernanceText,
    searchProject: async ({ projectId, embedding, objectTypes, threshold, limit }) => semanticSearchByEmbedding(supabase, {
      projectId,
      embedding,
      objectTypes: objectTypes as SemanticObjectType[] | null | undefined,
      threshold,
      limit,
    }),
  })
}
