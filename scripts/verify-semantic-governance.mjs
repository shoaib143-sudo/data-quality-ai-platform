import { readFile } from 'node:fs/promises'

const files = {
  search: await readFile('lib/governance/semantic-search.ts', 'utf8'),
  indexer: await readFile('lib/governance/semantic-indexer.ts', 'utf8'),
  documentIndexer: await readFile('lib/governance/semantic-document-indexer.ts', 'utf8'),
  documentContent: await readFile('lib/governance/document-content.ts', 'utf8'),
  fileProfile: await readFile('lib/profiling/file-profile.ts', 'utf8'),
  globalSearch: await readFile('app/api/search/route.ts', 'utf8'),
  reindexRoute: await readFile('app/api/search/semantic/reindex/route.ts', 'utf8'),
  searchUi: await readFile('app/search/global-search.tsx', 'utf8'),
  documentsPage: await readFile('app/documents/page.tsx', 'utf8'),
  explorerPage: await readFile('app/profiling/explorer/page.tsx', 'utf8'),
  explorer: await readFile('app/profiling/profiling-explorer.tsx', 'utf8'),
  documentMigration: await readFile('supabase/migrations/20260904150000_governed_document_content.sql', 'utf8'),
}

const checks = [
  [files.indexer, /QUALITY_INCIDENT/, 'quality incident semantic type'],
  [files.indexer, /\.from\('issues'\)/, 'governance issue indexing source'],
  [files.indexer, /resolution_summary[\s\S]*resolution_evidence/, 'quality incident resolution semantics'],
  [files.indexer, /MANAGED_SEMANTIC_TYPES[\s\S]*QUALITY_INCIDENT/, 'quality incident stale-pruning ownership'],
  [files.indexer, /FILTER_BATCH_SIZE[\s\S]*datasetBatch[\s\S]*versionBatch[\s\S]*runBatch/, 'bounded profiling semantic traversal'],
  [files.indexer, /pruneStaleSemanticObjects[\s\S]*semantic_embeddings[\s\S]*delete/, 'stale embedding pruning'],
  [files.search, /contentHash[\s\S]*maybeSingle[\s\S]*content_hash\s*===\s*contentHash/, 'unchanged content hash detection'],
  [files.search, /content_hash\s*===\s*contentHash[\s\S]*metadata[\s\S]*unchanged:\s*true/, 'unchanged embedding reuse with metadata refresh'],
  [files.search, /semanticSearchByEmbedding/, 'query embedding reuse API'],
  [files.documentMigration, /create table if not exists governance\.documents[\s\S]*create table if not exists governance\.document_chunks/, 'durable governed document schema'],
  [files.documentMigration, /unique\(project_id,dataset_version_id,source_uri\)[\s\S]*document_chunks_project_document_idx/, 'stable document identity and chunk indexing'],
  [files.documentMigration, /enable row level security[\s\S]*is_project_member[\s\S]*catalog\.update/, 'governed document RLS'],
  [files.documentMigration, /governance_documents_project_insert[\s\S]*governance_documents_project_update[\s\S]*governance_documents_project_delete/, 'non-overlapping document write RLS'],
  [files.documentMigration, /governance_document_chunks_project_insert[\s\S]*governance_document_chunks_project_update[\s\S]*governance_document_chunks_project_delete/, 'non-overlapping chunk write RLS'],
  [files.documentMigration, /\(select auth\.uid\(\)\)/, 'RLS auth initplan optimization'],
  [files.documentContent, /GOVERNED_DOCUMENT_EXTENSIONS[\s\S]*MAX_SEMANTIC_CHUNK_CHARACTERS\s*=\s*4000/, 'document semantic eligibility and chunk ceiling'],
  [files.documentContent, /sanitizePersistedDocumentUri[\s\S]*url\.username\s*=\s*''[\s\S]*url\.search\s*=\s*''[\s\S]*url\.hash\s*=\s*''/, 'signed URL credential and token sanitization'],
  [files.documentContent, /sourceUri\s*=\s*sanitizePersistedDocumentUri\(loaded\.sourceUri\)[\s\S]*sanitizedMetadata\.source_uri\s*=\s*sourceUri/, 'sanitized document identity and metadata'],
  [files.documentContent, /persistGovernedDocumentContent[\s\S]*documents[\s\S]*document_chunks/, 'document extraction persistence'],
  [files.documentContent, /content_truncated_by_execution_ceiling/, 'document extraction truncation evidence'],
  [files.fileProfile, /persistGovernedDocumentContent[\s\S]*loaded[\s\S]*applySamplingPolicy/, 'document persistence before profiling sampling'],
  [files.documentIndexer, /DOCUMENT[\s\S]*DOCUMENT_CHUNK/, 'document and chunk semantic types'],
  [files.documentIndexer, /\.from\('documents'\)[\s\S]*\.from\('document_chunks'\)/, 'document semantic indexing sources'],
  [files.documentIndexer, /pruneStaleDocumentEmbeddings[\s\S]*semantic_embeddings/, 'stale document embedding pruning'],
  [files.documentIndexer, /UNCHANGED[\s\S]*indexed\.unchanged/, 'unchanged document embedding reporting'],
  [files.reindexRoute, /reindexProjectSemanticObjects[\s\S]*reindexProjectDocumentSemanticObjects[\s\S]*groups/, 'combined governance and document semantic reindex'],
  [files.globalSearch, /SEMANTIC_PROJECT_CONCURRENCY\s*=\s*4/, 'bounded hybrid project concurrency'],
  [files.globalSearch, /mapWithConcurrency[\s\S]*semanticSearchByEmbedding/, 'bounded semantic fan-out'],
  [files.globalSearch, /QUALITY_INCIDENT[\s\S]*\/issues\?issue=/, 'quality incident semantic navigation'],
  [files.globalSearch, /DOCUMENT[\s\S]*DOCUMENT_CHUNK[\s\S]*\/documents\?document=/, 'document semantic navigation'],
  [files.globalSearch, /\.from\('documents'\)[\s\S]*\.from\('document_chunks'\)/, 'document lexical fallback retrieval'],
  [files.globalSearch, /objectTypes:[\s\S]*DOCUMENT[\s\S]*DOCUMENT_CHUNK/, 'document hybrid retrieval'],
  [files.globalSearch, /NOT_CONFIGURED[\s\S]*UNAVAILABLE/, 'lexical fallback when semantic provider is absent or unavailable'],
  [files.documentsPage, /Governed Documents[\s\S]*document_chunks[\s\S]*focusedChunkId/, 'governed document viewer and chunk focus'],
  [files.searchUi, /Hybrid semantic/, 'hybrid search user indicator'],
  [files.explorerPage, /runId[\s\S]*columnId[\s\S]*findingId/, 'profile semantic deep-link parameters'],
  [files.explorer, /initialColumnId[\s\S]*initialFindingId[\s\S]*focusedFindingId/, 'profile semantic deep-link focus'],
]

for (const [source, pattern, label] of checks) {
  if (!pattern.test(source)) throw new Error(`Semantic governance contract failed: ${label}`)
  console.log(`PASS ${label}`)
}

console.log('Semantic governance verification completed.')
