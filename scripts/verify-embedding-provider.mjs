import { readFile } from 'node:fs/promises'

const contract = await readFile('lib/ai/embedding-provider.ts', 'utf8')
const adapter = await readFile('lib/ai/governance-embedding-provider.ts', 'utf8')
const retrieval = await readFile('lib/ai/governance-retrieval-provider.ts', 'utf8')

const checks = [
  [contract.includes('export interface EmbeddingProvider'), 'stable EmbeddingProvider interface'],
  [contract.includes("export type EmbeddingPurpose = 'query' | 'document'"), 'explicit embedding purpose'],
  [contract.includes('RuntimeEmbeddingProvider'), 'runtime adapter implementation'],
  [adapter.includes('embedGovernanceText'), 'governance adapter reuses existing governed embedding runtime'],
  [adapter.includes("'governance_embedding_runtime'"), 'governance embedding provider identity'],
  [retrieval.includes('createGovernanceEmbeddingProvider'), 'retrieval uses EmbeddingProvider adapter'],
  [retrieval.includes("purpose: 'query'"), 'retrieval labels query embedding purpose'],
  [!retrieval.includes('embedGovernanceText'), 'retrieval does not bypass EmbeddingProvider'],
  [retrieval.includes('semanticSearchByEmbedding'), 'pgvector search behavior remains unchanged'],
]

for (const [passed, label] of checks) {
  if (!passed) throw new Error(`EmbeddingProvider contract failed: ${label}`)
  console.log(`PASS ${label}`)
}

console.log('ADR-006 EmbeddingProvider verification completed.')
