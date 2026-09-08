import fs from 'node:fs'

const provider = fs.readFileSync('lib/ai/retrieval-provider.ts', 'utf8')
const adapter = fs.readFileSync('lib/ai/governance-retrieval-provider.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`RetrievalProvider contract missing: ${label}`)
}

requireText(provider, 'export interface RetrievalProvider', 'stable retrieval provider interface')
requireText(provider, "export type RetrievalMode = 'lexical' | 'semantic' | 'graph' | 'temporal' | 'authority'", 'target retrieval channels')
requireText(provider, 'readonly capabilities: RetrievalCapabilities', 'explicit provider capabilities')
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

console.log('ADR-006 RetrievalProvider contract verified.')
