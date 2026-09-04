function choice(name, fallback, allowed) {
  const value = (process.env[name] ?? fallback).trim().toLowerCase()
  if (!allowed.includes(value)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`)
  return value
}

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required by the selected data-plane configuration`)
  return value
}

function boundedInt(name, fallback, min, max) {
  const raw = process.env[name]
  if (raw == null || raw.trim() === '') return fallback
  const value = Number.parseInt(raw, 10)
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`)
  }
  return value
}

const selection = {
  knowledgeSearch: choice('KNOWLEDGE_SEARCH_PROVIDER', 'postgres', ['postgres', 'opensearch']),
  graph: choice('GRAPH_PROVIDER', 'postgres', ['postgres', 'age', 'distributed']),
  analytics: choice('ANALYTICS_PROVIDER', 'postgres', ['postgres', 'clickhouse']),
  objectStore: choice('OBJECT_STORE_PROVIDER', 'supabase', ['supabase', 's3']),
}

boundedInt('PROVIDER_TIMEOUT_MS', 10000, 500, 120000)
boundedInt('PROVIDER_MAX_ATTEMPTS', 3, 1, 6)
boundedInt('PROVIDER_RETRY_BASE_MS', 250, 25, 10000)
boundedInt('PROVIDER_RETRY_MAX_MS', 2000, 25, 30000)

for (const prefix of ['OPENSEARCH', 'CLICKHOUSE']) {
  boundedInt(`${prefix}_TIMEOUT_MS`, 10000, 500, 120000)
  boundedInt(`${prefix}_MAX_ATTEMPTS`, 3, 1, 6)
  boundedInt(`${prefix}_RETRY_BASE_MS`, 250, 25, 10000)
  boundedInt(`${prefix}_RETRY_MAX_MS`, 2000, 25, 30000)
}

if (selection.knowledgeSearch === 'opensearch') {
  requireEnv('OPENSEARCH_ENDPOINT')
  const username = process.env.OPENSEARCH_USERNAME?.trim()
  const password = process.env.OPENSEARCH_PASSWORD
  if (Boolean(username) !== (password != null && password !== '')) {
    throw new Error('OPENSEARCH_USERNAME and OPENSEARCH_PASSWORD must be configured together')
  }
  const semanticEnabled = process.env.OPENSEARCH_SEMANTIC_ENABLED?.trim().toLowerCase() === 'true'
  if (semanticEnabled) {
    requireEnv('OPENSEARCH_EMBEDDING_MODEL_ID')
    boundedInt('OPENSEARCH_EMBEDDING_DIMENSION', NaN, 8, 65535)
  }
}

if (selection.analytics === 'clickhouse') {
  requireEnv('CLICKHOUSE_ENDPOINT')
  requireEnv('CLICKHOUSE_USER')
  requireEnv('CLICKHOUSE_PASSWORD')
}

if (selection.graph !== 'postgres') {
  throw new Error(`GRAPH_PROVIDER=${selection.graph} is not deployable yet; PostgreSQL is the only implemented graph provider`)
}

if (selection.objectStore !== 'supabase') {
  throw new Error(`OBJECT_STORE_PROVIDER=${selection.objectStore} is not deployable yet; Supabase is the only implemented object store`)
}

console.log(JSON.stringify({
  valid: true,
  selection,
  semanticOpenSearch: selection.knowledgeSearch === 'opensearch' && process.env.OPENSEARCH_SEMANTIC_ENABLED?.trim().toLowerCase() === 'true',
  readFallbackEnabled: process.env.PROVIDER_READ_FALLBACK_ENABLED?.trim().toLowerCase() !== 'false',
}, null, 2))
