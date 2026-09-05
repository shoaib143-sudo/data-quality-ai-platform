import { readFile } from 'node:fs/promises'

const files = {
  search: await readFile('lib/governance/semantic-search.ts', 'utf8'),
  semanticJobs: await readFile('lib/governance/semantic-jobs.ts', 'utf8'),
  edgeEmbedding: await readFile('supabase/functions/governance-embed/index.ts', 'utf8'),
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
  documentFkMigration: await readFile('supabase/migrations/20260904153000_governed_document_fk_indexes.sql', 'utf8'),
}

function containsAll(source, tokens) {
  return tokens.every((token) => source.includes(token))
}

function appearsBefore(source, first, second) {
  const firstIndex = source.indexOf(first)
  const secondIndex = source.indexOf(second)
  return firstIndex >= 0 && secondIndex >= 0 && firstIndex < secondIndex
}

const checks = [
  [/QUALITY_INCIDENT/.test(files.indexer), 'quality incident semantic type'],
  [/\.from\('issues'\)/.test(files.indexer), 'governance issue indexing source'],
  [/resolution_summary[\s\S]*resolution_evidence/.test(files.indexer), 'quality incident resolution semantics'],
  [/MANAGED_SEMANTIC_TYPES[\s\S]*QUALITY_INCIDENT/.test(files.indexer), 'quality incident stale-pruning ownership'],
  [/FILTER_BATCH_SIZE[\s\S]*datasetBatch[\s\S]*versionBatch[\s\S]*runBatch/.test(files.indexer), 'bounded profiling semantic traversal'],
  [/pruneStaleSemanticObjects[\s\S]*semantic_embeddings[\s\S]*delete/.test(files.indexer), 'stale embedding pruning'],
  [/contentHash[\s\S]*maybeSingle[\s\S]*content_hash\s*===\s*contentHash/.test(files.search), 'unchanged content hash detection'],
  [/content_hash\s*===\s*contentHash[\s\S]*metadata[\s\S]*unchanged:\s*true/.test(files.search), 'unchanged embedding reuse with metadata refresh'],
  [files.search.includes('semanticSearchByEmbedding'), 'query embedding reuse API'],
  [containsAll(files.search, ['GOVERNANCE_EMBEDDING_URL', 'GOVERNANCE_EMBEDDING_API_KEY']), 'custom governance embedding provider compatibility'],
  [containsAll(files.search, ['DEFAULT_SUPABASE_EMBEDDING_MODEL', 'gte-small', "admin.functions.invoke('governance-embed'", 'SUPABASE_SERVICE_ROLE_KEY']), 'Supabase native governance embedding provider'],
  [containsAll(files.edgeEmbedding, ["new Supabase.ai.Session('gte-small')", 'mean_pool: true', 'normalize: true', 'DIMENSIONS = 384']), 'Supabase Edge Runtime 384-dimensional normalized embeddings'],
  [containsAll(files.edgeEmbedding, ['bearerRole', "'service_role'", 'Deno.serve', 'verify_jwt is enabled at the platform boundary']), 'Supabase embedding function service-role JWT authorization'],
  [containsAll(files.search, ['DEFAULT_GATEWAY_EMBEDDING_MODEL', 'https://ai-gateway.vercel.sh/v1/embeddings', 'VERCEL_OIDC_TOKEN', 'AI_GATEWAY_API_KEY', 'dimensions: EMBEDDING_DIMENSIONS']), 'Vercel AI Gateway embedding fallback'],
  [containsAll(files.search, ["from 'next/headers'", "incoming.get('x-vercel-oidc-token')", 'await gatewayApiKey()']), 'Vercel function request-context OIDC authentication'],
  [/normalizeEmbedding[\s\S]*Math\.sqrt[\s\S]*Number\.EPSILON/.test(files.search), 'embedding normalization and zero-vector rejection'],
  [containsAll(files.semanticJobs, ['GOVERNANCE_EMBEDDING_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'AI_GATEWAY_API_KEY', 'VERCEL_OIDC_TOKEN', "process.env.VERCEL === '1'"]), 'semantic job scheduling accepts custom, Supabase, or Vercel runtime provider'],
  [containsAll(files.documentMigration, ['create table if not exists governance.documents', 'create table if not exists governance.document_chunks']), 'durable governed document schema'],
  [containsAll(files.documentMigration, ['unique(project_id,dataset_version_id,source_uri)', 'document_chunks_project_document_idx']), 'stable document identity and chunk indexing'],
  [containsAll(files.documentMigration, ['enable row level security', 'is_project_member', "'catalog.update'"]), 'governed document RLS'],
  [containsAll(files.documentMigration, ['governance_documents_project_insert', 'governance_documents_project_update', 'governance_documents_project_delete']), 'non-overlapping document write RLS'],
  [containsAll(files.documentMigration, ['governance_document_chunks_project_insert', 'governance_document_chunks_project_update', 'governance_document_chunks_project_delete']), 'non-overlapping chunk write RLS'],
  [files.documentMigration.includes('(select auth.uid())'), 'RLS auth initplan optimization'],
  [containsAll(files.documentFkMigration, ['governance_documents_dataset_idx', 'governance_documents_dataset_version_idx']), 'governed document foreign-key indexes'],
  [containsAll(files.documentContent, ['GOVERNED_DOCUMENT_EXTENSIONS', 'MAX_SEMANTIC_CHUNK_CHARACTERS = 4000']), 'document semantic eligibility and chunk ceiling'],
  [containsAll(files.documentContent, ["url.username = ''", "url.password = ''", "url.search = ''", "url.hash = ''"]), 'signed URL credential and token sanitization'],
  [containsAll(files.documentContent, ['sanitizePersistedDocumentUri(loaded.sourceUri)', 'sanitizedMetadata.source_uri = sourceUri']), 'sanitized document identity and metadata'],
  [containsAll(files.documentContent, ['persistGovernedDocumentContent', ".from('documents')", ".from('document_chunks')"]), 'document extraction persistence'],
  [files.documentContent.includes('content_truncated_by_execution_ceiling'), 'document extraction truncation evidence'],
  [appearsBefore(files.fileProfile, 'await persistGovernedDocumentContent', 'applySamplingPolicy(loaded.rows'), 'document persistence before profiling sampling'],
  [containsAll(files.documentIndexer, ["objectType: 'DOCUMENT'", "objectType: 'DOCUMENT_CHUNK'"]), 'document and chunk semantic types'],
  [containsAll(files.documentIndexer, [".from('documents')", ".from('document_chunks')"]), 'document semantic indexing sources'],
  [containsAll(files.documentIndexer, ['pruneStaleDocumentEmbeddings', 'semantic_embeddings']), 'stale document embedding pruning'],
  [containsAll(files.documentIndexer, ['UNCHANGED', 'indexed.unchanged']), 'unchanged document embedding reporting'],
  [containsAll(files.reindexRoute, ['reindexProjectSemanticObjects', 'reindexProjectDocumentSemanticObjects', 'groups']), 'combined governance and document semantic reindex'],
  [/SEMANTIC_PROJECT_CONCURRENCY\s*=\s*4/.test(files.globalSearch), 'bounded hybrid project concurrency'],
  [containsAll(files.globalSearch, ['mapWithConcurrency', 'semanticSearchByEmbedding']), 'bounded semantic fan-out'],
  [containsAll(files.globalSearch, ['QUALITY_INCIDENT', '/issues?issue=']), 'quality incident semantic navigation'],
  [containsAll(files.globalSearch, ['DOCUMENT', 'DOCUMENT_CHUNK', '/documents?document=']), 'document semantic navigation'],
  [containsAll(files.globalSearch, [".from('documents')", ".from('document_chunks')"]), 'document lexical fallback retrieval'],
  [containsAll(files.globalSearch, ["'DOCUMENT'", "'DOCUMENT_CHUNK'", 'objectTypes:']), 'document hybrid retrieval'],
  [containsAll(files.globalSearch, ['NOT_CONFIGURED', 'UNAVAILABLE']), 'lexical fallback when semantic provider is absent or unavailable'],
  [containsAll(files.documentsPage, ['Governed Documents', 'document_chunks', 'focusedChunkId']), 'governed document viewer and chunk focus'],
  [files.searchUi.includes('Hybrid semantic'), 'hybrid search user indicator'],
  [containsAll(files.explorerPage, ['runId', 'columnId', 'findingId']), 'profile semantic deep-link parameters'],
  [containsAll(files.explorer, ['initialColumnId', 'initialFindingId', 'focusedFindingId']), 'profile semantic deep-link focus'],
]

for (const [passed, label] of checks) {
  if (!passed) throw new Error(`Semantic governance contract failed: ${label}`)
  console.log(`PASS ${label}`)
}

console.log('Semantic governance verification completed.')
