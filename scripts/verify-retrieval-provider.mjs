import fs from 'node:fs'

const provider = fs.readFileSync('lib/ai/retrieval-provider.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-retrieval-provider.ts', 'utf8')
const globalSearch = fs.readFileSync('app/api/search/route.ts', 'utf8')
const semanticApi = fs.readFileSync('app/api/search/semantic/route.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`RetrievalProvider contract missing: ${label}`)
}

requireText(provider, 'export interface RetrievalProvider', 'stable retrieval provider interface')
requireText(provider, "export type RetrievalMode = 'lexical' | 'semantic' | 'graph' | 'temporal' | 'authority'", 'target retrieval channels')
requireText(provider, 'readonly capabilities: RetrievalCapabilities', 'explicit provider capabilities')
requireText(provider, 'projectionId: string | null', 'semantic projection identity preservation')
requireText(provider, 'projectionId: match.id ?? null', 'projection identity mapping')
requireText(provider, 'lexical: false', 'no false lexical support claim')
requireText(provider, 'semantic: true', 'semantic projection support')
requireText(provider, 'graph: false', 'no false graph support claim')
requireText(provider, 'temporal: false', 'no false temporal support claim')
requireText(provider, 'authority: false', 'no false authority weighting claim')
requireText(provider, 'governance.semantic_embeddings', 'semantic projection provenance')
requireText(provider, 'projection: true', 'retrieval projection truth boundary')
requireText(provider, 'does not support requested modes', 'fail-closed unsupported channel behavior')
requireText(adapter, 'embedGovernanceText', 'existing embedding implementation reuse')
requireText(adapter, 'semanticSearchByEmbedding', 'existing pgvector search implementation reuse')
requireText(adapter, 'new SemanticProjectionRetrievalProvider', 'governance adapter behind stable contract')
requireText(globalSearch, 'createGovernanceRetrievalProvider', 'global search provider construction')
requireText(globalSearch, "modes: ['semantic']", 'global search explicit semantic mode')
requireText(globalSearch, 'retrieved.matches.map(semanticResult)', 'global search provider result consumption')
requireText(globalSearch, 'retrieval_projection: match.provenance.projection', 'global search projection truth metadata')
requireText(semanticApi, 'createGovernanceRetrievalProvider', 'semantic API provider construction')
requireText(semanticApi, 'projectIds: [projectId]', 'semantic API project scope preservation')
requireText(semanticApi, "modes: ['semantic']", 'semantic API explicit semantic mode')
requireText(semanticApi, 'response.matches.map(legacySemanticResult)', 'semantic API provider result consumption')
requireText(semanticApi, 'id: match.projectionId', 'semantic API legacy projection id preservation')
requireText(semanticApi, 'SEMANTIC_EMBEDDING_PROVIDER_NOT_CONFIGURED', 'semantic API provider-not-configured contract')

if (globalSearch.includes('semanticSearchByEmbedding') || globalSearch.includes('embedGovernanceText')) {
  throw new Error('Global search must not bypass the RetrievalProvider boundary.')
}
if (/import\s*\{[^}]*semanticSearch[^}]*\}\s*from\s*['"]@\/lib\/governance\/semantic-search['"]/.test(semanticApi)) {
  throw new Error('Semantic search API must not bypass the RetrievalProvider boundary.')
}

console.log('ADR-006 RetrievalProvider contract and search integrations verified.')
