import {
  embedGovernanceTextWithEvidence,
} from '@/lib/governance/semantic-search'
import type { EmbeddingProvider } from './embedding-provider'

export function createGovernanceEmbeddingProvider(): EmbeddingProvider {
  return {
    id: 'governance_embedding_runtime',
    async embed(request) {
      const evidence = await embedGovernanceTextWithEvidence(request.input, request.model ?? undefined)
      return {
        embedding: evidence.embedding,
        providerId: evidence.identity.providerId,
        model: evidence.identity.model,
        modelRevision: evidence.identity.revision,
        dimensions: evidence.identity.dimensions,
        embeddingSpaceId: evidence.embeddingSpaceId,
      }
    },
  }
}
