import { readFile } from 'node:fs/promises'

const files = {
  search: await readFile('lib/governance/semantic-search.ts', 'utf8'),
  indexer: await readFile('lib/governance/semantic-indexer.ts', 'utf8'),
  globalSearch: await readFile('app/api/search/route.ts', 'utf8'),
  searchUi: await readFile('app/search/global-search.tsx', 'utf8'),
  explorerPage: await readFile('app/profiling/explorer/page.tsx', 'utf8'),
  explorer: await readFile('app/profiling/profiling-explorer.tsx', 'utf8'),
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
  [files.globalSearch, /SEMANTIC_PROJECT_CONCURRENCY\s*=\s*4/, 'bounded hybrid project concurrency'],
  [files.globalSearch, /mapWithConcurrency[\s\S]*semanticSearchByEmbedding/, 'bounded semantic fan-out'],
  [files.globalSearch, /QUALITY_INCIDENT[\s\S]*\/issues\?issue=/, 'quality incident semantic navigation'],
  [files.globalSearch, /objectTypes:[\s\S]*QUALITY_INCIDENT/, 'quality incident hybrid retrieval'],
  [files.globalSearch, /NOT_CONFIGURED[\s\S]*UNAVAILABLE/, 'lexical fallback when semantic provider is absent or unavailable'],
  [files.searchUi, /Hybrid semantic/, 'hybrid search user indicator'],
  [files.explorerPage, /runId[\s\S]*columnId[\s\S]*findingId/, 'profile semantic deep-link parameters'],
  [files.explorer, /initialColumnId[\s\S]*initialFindingId[\s\S]*focusedFindingId/, 'profile semantic deep-link focus'],
]

for (const [source, pattern, label] of checks) {
  if (!pattern.test(source)) throw new Error(`Semantic governance contract failed: ${label}`)
  console.log(`PASS ${label}`)
}

console.log('Semantic governance verification completed.')
