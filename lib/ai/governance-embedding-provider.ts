import { embedGovernanceText } from '@/lib/governance/semantic-search'
import { RuntimeEmbeddingProvider, type EmbeddingProvider } from './embedding-provider'

export function createGovernanceEmbeddingProvider(): EmbeddingProvider {
  return new RuntimeEmbeddingProvider('governance_embedding_runtime', {
    embedText: embedGovernanceText,
  })
}
