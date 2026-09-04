import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const endpoint = process.env.OPENSEARCH_ENDPOINT?.trim()?.replace(/\/$/, '')
if (!endpoint) throw new Error('OPENSEARCH_ENDPOINT is required')

const prefix = (process.env.OPENSEARCH_INDEX_PREFIX ?? 'datanexus').trim().toLowerCase()
if (!/^[a-z0-9][a-z0-9_-]*$/.test(prefix)) throw new Error('OPENSEARCH_INDEX_PREFIX contains unsupported characters')

const username = process.env.OPENSEARCH_USERNAME?.trim()
const password = process.env.OPENSEARCH_PASSWORD
if ((username && password == null) || (!username && password != null)) {
  throw new Error('OPENSEARCH_USERNAME and OPENSEARCH_PASSWORD must be configured together')
}

const semanticEnabled = process.env.OPENSEARCH_SEMANTIC_ENABLED?.trim().toLowerCase() === 'true'
const modelId = process.env.OPENSEARCH_EMBEDDING_MODEL_ID?.trim()
const embeddingDimension = Number.parseInt(process.env.OPENSEARCH_EMBEDDING_DIMENSION ?? '', 10)
if (semanticEnabled && !modelId) throw new Error('OPENSEARCH_EMBEDDING_MODEL_ID is required when OPENSEARCH_SEMANTIC_ENABLED=true')
if (semanticEnabled && (!Number.isFinite(embeddingDimension) || embeddingDimension < 8 || embeddingDimension > 65535)) {
  throw new Error('OPENSEARCH_EMBEDDING_DIMENSION must be between 8 and 65535 when semantic search is enabled')
}

const headers = { 'content-type': 'application/json' }
if (username && password != null) {
  headers.authorization = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

async function request(resource, options = {}) {
  const response = await fetch(`${endpoint}${resource}`, {
    ...options,
    headers: { ...headers, ...(options.headers ?? {}) },
  })
  const text = await response.text()
  if (!response.ok) {
    const error = new Error(`OpenSearch ${options.method ?? 'GET'} ${resource} failed (${response.status}): ${text.slice(0, 2000)}`)
    error.status = response.status
    throw error
  }
  return text ? JSON.parse(text) : null
}

async function exists(resource) {
  try {
    await request(resource)
    return true
  } catch (error) {
    if (error.status === 404) return false
    throw error
  }
}

const alias = `${prefix}-knowledge`
const targetVersion = semanticEnabled ? 'v2' : 'v1'
const backingIndex = `${alias}-${targetVersion}`
const ingestPipeline = `${alias}-semantic-ingest`
const searchPipeline = `${alias}-hybrid-search`
const here = path.dirname(fileURLToPath(import.meta.url))
const mappingPath = path.join(here, '..', 'infra', 'data-plane', 'opensearch', 'knowledge-index-v1.json')
const mapping = JSON.parse(await readFile(mappingPath, 'utf8'))

if (semanticEnabled) {
  mapping.settings = {
    ...(mapping.settings ?? {}),
    'index.knn': true,
    default_pipeline: ingestPipeline,
  }
  mapping.mappings.properties.embedding = {
    type: 'knn_vector',
    dimension: embeddingDimension,
    method: {
      name: 'hnsw',
      engine: 'lucene',
      space_type: 'cosinesimil',
      parameters: {},
    },
  }

  await request(`/_ingest/pipeline/${encodeURIComponent(ingestPipeline)}`, {
    method: 'PUT',
    body: JSON.stringify({
      description: 'Generate knowledge content embeddings during projection ingestion',
      processors: [{
        text_embedding: {
          model_id: modelId,
          field_map: {
            content: 'embedding',
          },
        },
      }],
    }),
  })

  await request(`/_search/pipeline/${encodeURIComponent(searchPipeline)}`, {
    method: 'PUT',
    body: JSON.stringify({
      description: 'Normalize and combine lexical and semantic knowledge scores',
      phase_results_processors: [{
        normalization_processor: {
          normalization: { technique: 'min_max' },
          combination: {
            technique: 'arithmetic_mean',
            parameters: { weights: [0.5, 0.5] },
          },
        },
      }],
    }),
  })
}

const aliasState = await request(`/_alias/${encodeURIComponent(alias)}`).catch((error) => {
  if (error.status === 404) return null
  throw error
})

if (!(await exists(`/${encodeURIComponent(backingIndex)}`))) {
  await request(`/${encodeURIComponent(backingIndex)}`, {
    method: 'PUT',
    body: JSON.stringify(mapping),
  })
  console.log(`Created OpenSearch backing index ${backingIndex}.`)
}

const currentIndexes = aliasState ? Object.keys(aliasState) : []
const currentIndex = currentIndexes.find((index) => index !== backingIndex) ?? currentIndexes[0] ?? null

if (currentIndex && currentIndex !== backingIndex) {
  await request('/_reindex?wait_for_completion=true&refresh=true', {
    method: 'POST',
    body: JSON.stringify({
      source: { index: currentIndex },
      dest: { index: backingIndex },
      conflicts: 'proceed',
    }),
  })
  console.log(`Reindexed OpenSearch knowledge documents ${currentIndex} -> ${backingIndex}.`)
}

const actions = []
for (const index of currentIndexes) {
  if (index !== backingIndex) actions.push({ remove: { index, alias } })
}
actions.push({ add: { index: backingIndex, alias, is_write_index: true } })

await request('/_aliases', {
  method: 'POST',
  body: JSON.stringify({ actions }),
})

console.log(`Configured OpenSearch alias ${alias} -> ${backingIndex}${semanticEnabled ? ` with semantic model ${modelId}` : ''}.`)
