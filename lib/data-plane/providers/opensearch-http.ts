import { providerFetch } from '@/lib/data-plane/provider-runtime'

export type OpenSearchConnection = {
  endpoint: string
  knowledgeIndex: string
  headers: Record<string, string>
  semanticEnabled: boolean
  embeddingModelId: string | null
  hybridSearchPipeline: string | null
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function basicAuthorization() {
  const username = process.env.OPENSEARCH_USERNAME?.trim()
  const password = process.env.OPENSEARCH_PASSWORD
  if (!username && password == null) return null
  if (!username || password == null) {
    throw new Error('OPENSEARCH_USERNAME and OPENSEARCH_PASSWORD must be configured together')
  }
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

export function getOpenSearchConnection(): OpenSearchConnection {
  const prefix = (process.env.OPENSEARCH_INDEX_PREFIX ?? 'datanexus').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(prefix)) {
    throw new Error('OPENSEARCH_INDEX_PREFIX contains unsupported characters')
  }
  const authorization = basicAuthorization()
  const semanticEnabled = process.env.OPENSEARCH_SEMANTIC_ENABLED?.trim().toLowerCase() === 'true'
  const embeddingModelId = process.env.OPENSEARCH_EMBEDDING_MODEL_ID?.trim() || null
  if (semanticEnabled && !embeddingModelId) {
    throw new Error('OPENSEARCH_EMBEDDING_MODEL_ID is required when OPENSEARCH_SEMANTIC_ENABLED=true')
  }
  return {
    endpoint: requireEnv('OPENSEARCH_ENDPOINT').replace(/\/$/, ''),
    knowledgeIndex: `${prefix}-knowledge`,
    headers: {
      ...(authorization ? { authorization } : {}),
    },
    semanticEnabled,
    embeddingModelId,
    hybridSearchPipeline: semanticEnabled ? `${prefix}-knowledge-hybrid-search` : null,
  }
}

export async function openSearchRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const connection = getOpenSearchConnection()
  return providerFetch(`${connection.endpoint}${path}`, {
    ...init,
    headers: {
      ...connection.headers,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  }, { providerKey: 'opensearch' })
}
