import fs from 'node:fs'
import { execFileSync } from 'node:child_process'

const provider = fs.readFileSync('lib/ai/retrieval-provider.ts', 'utf8')
const reranker = fs.readFileSync('lib/ai/reranker-provider.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-retrieval-provider.ts', 'utf8')
const embeddingAdapter = fs.readFileSync('lib/ai/governance-embedding-provider.ts', 'utf8')
const globalSearch = fs.readFileSync('app/api/search/route.ts', 'utf8')
const semanticApi = fs.readFileSync('app/api/search/semantic/route.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`RetrievalProvider contract missing: ${label}`)
}

requireText(provider, 'export interface RetrievalProvider', 'stable retrieval provider interface')
requireText(provider, "export type RetrievalMode = 'lexical' | 'semantic' | 'graph' | 'temporal' | 'authority'", 'target retrieval channels')
requireText(provider, 'readonly capabilities: RetrievalCapabilities', 'explicit provider capabilities')
requireText(provider, 'projectionId: string | null', 'semantic projection identity preservation')
requireText(provider, 'baseScore?: number', 'original retrieval score preservation after reranking')
requireText(provider, 'rerankedBy?: string', 'reranker provenance')
requireText(provider, 'projectionId: match.id ?? null', 'projection identity mapping')
requireText(provider, 'lexical: false', 'no false lexical support claim')
requireText(provider, 'semantic: true', 'semantic projection support')
requireText(provider, 'graph: false', 'no false graph support claim')
requireText(provider, 'temporal: false', 'no false temporal weighting claim')
requireText(provider, 'authority: false', 'no false authority weighting claim')
requireText(provider, 'governance.semantic_embeddings', 'semantic projection provenance')
requireText(provider, 'projection: true', 'retrieval projection truth boundary')
requireText(provider, 'does not support requested modes', 'fail-closed unsupported channel behavior')
requireText(provider, 'withNormalizedRetrievalMetadata(match.metadata)', 'canonical retrieval metadata normalization')
requireText(provider, "authorityClass: 'UNKNOWN'", 'unknown authority remains explicit')
requireText(provider, "temporalStatus: 'MISSING'", 'missing temporal evidence remains explicit')
requireText(provider, "temporalStatus: 'INVALID'", 'invalid temporal evidence remains explicit')
requireText(provider, "temporalStatus: 'FUTURE'", 'future temporal evidence remains explicit')
requireText(provider, 'retrieval_normalization:', 'normalized metadata projection namespace')

requireText(reranker, 'export interface RerankerProvider', 'stable reranker provider interface')
requireText(reranker, 'DeterministicRelevanceReranker', 'deterministic initial reranker')
requireText(reranker, "readonly id = 'deterministic_relevance_v1'", 'explicit reranker identity')
requireText(reranker, 'RerankingRetrievalProvider', 'retrieval and reranker composition boundary')
requireText(reranker, 'candidateMultiplier = 3', 'bounded candidate oversampling default')
requireText(reranker, 'baseScore', 'semantic score preservation')
requireText(reranker, 'rerankedBy: this.id', 'reranking provenance propagation')
requireText(reranker, 'baseScore * 0.8', 'deterministic semantic component')
requireText(reranker, 'coverage * 0.15', 'deterministic lexical coverage component')
requireText(reranker, 'phrase * 0.05', 'deterministic phrase component')

requireText(embeddingAdapter, 'embedGovernanceText', 'existing embedding runtime reuse behind EmbeddingProvider')
requireText(adapter, 'createGovernanceEmbeddingProvider', 'EmbeddingProvider composition')
requireText(adapter, 'semanticSearchByEmbedding', 'existing pgvector search implementation reuse')
requireText(adapter, 'new SemanticProjectionRetrievalProvider', 'governance adapter behind stable contract')
requireText(adapter, 'new RerankingRetrievalProvider', 'dedicated reranker composition')
requireText(adapter, 'new DeterministicRelevanceReranker()', 'initial deterministic reranker selection')

requireText(globalSearch, 'createGovernanceRetrievalProvider', 'global search provider construction')
requireText(globalSearch, "modes: ['semantic']", 'global search explicit semantic mode')
requireText(globalSearch, 'retrieved.matches.map(semanticResult)', 'global search provider result consumption')
requireText(globalSearch, 'similarity: match.baseScore ?? match.score', 'global search preserves vector similarity')
requireText(globalSearch, 'rerank_score: match.provenance.rerankedBy ? match.score : null', 'global search rerank evidence')
requireText(globalSearch, 'reranked_by: match.provenance.rerankedBy ?? null', 'global search reranker provenance')
requireText(globalSearch, 'retrieval_projection: match.provenance.projection', 'global search projection truth metadata')

requireText(semanticApi, 'createGovernanceRetrievalProvider', 'semantic API provider construction')
requireText(semanticApi, 'projectIds: [projectId]', 'semantic API project scope preservation')
requireText(semanticApi, "modes: ['semantic']", 'semantic API explicit semantic mode')
requireText(semanticApi, 'response.matches.map(legacySemanticResult)', 'semantic API provider result consumption')
requireText(semanticApi, 'id: match.projectionId', 'semantic API legacy projection id preservation')
requireText(semanticApi, 'similarity: match.baseScore ?? match.score', 'legacy semantic similarity preservation after reranking')
requireText(semanticApi, 'rerank_score: match.provenance.rerankedBy ? match.score : null', 'semantic API rerank score evidence')
requireText(semanticApi, 'SEMANTIC_EMBEDDING_PROVIDER_NOT_CONFIGURED', 'semantic API provider-not-configured contract')

if (adapter.includes('embedGovernanceText')) {
  throw new Error('RetrievalProvider adapter must not bypass the EmbeddingProvider boundary.')
}
if (globalSearch.includes('semanticSearchByEmbedding') || globalSearch.includes('embedGovernanceText')) {
  throw new Error('Global search must not bypass the RetrievalProvider boundary.')
}
if (/import\s*\{[^}]*semanticSearch[^}]*\}\s*from\s*['"]@\/lib\/governance\/semantic-search['"]/.test(semanticApi)) {
  throw new Error('Semantic search API must not bypass the RetrievalProvider boundary.')
}
if (/\b(openai|anthropic|gemini|reasoningProvider)\b/i.test(reranker)) {
  throw new Error('Initial reranker must remain deterministic and must not smuggle a reasoning model into retrieval ranking.')
}
for (const forbidden of ['metadata.authority', "metadata['authority']", 'authorityScore', 'effectiveDateScore', 'supersededPenalty']) {
  if (reranker.includes(forbidden)) {
    throw new Error(`Deterministic reranker must not invent authority or temporal scoring: ${forbidden}`)
  }
}

execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/test-retrieval-metadata-normalization.mjs'], { stdio: 'inherit' })
console.log('ADR-006 RetrievalProvider, normalized metadata projection, dedicated RerankerProvider, and search integration contracts verified.')
