export type OpenSearchConnection = {
  endpoint: string
  knowledgeIndex: string
  headers: Record<string, string>
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
  return {
    endpoint: requireEnv('OPENSEARCH_ENDPOINT').replace(/\/$/, ''),
    knowledgeIndex: `${prefix}-knowledge`,
    headers: {
      ...(authorization ? { authorization } : {}),
    },
  }
}

export async function openSearchRequest(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const connection = getOpenSearchConnection()
  return fetch(`${connection.endpoint}${path}`, {
    ...init,
    headers: {
      ...connection.headers,
      ...(init.headers ?? {}),
    },
    cache: 'no-store',
  })
}
