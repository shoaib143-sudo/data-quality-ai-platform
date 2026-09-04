import type {
  KnowledgeSearchProvider,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
} from '@/lib/data-plane/contracts'

type OpenSearchConfig = {
  endpoint: string
  index: string
  authorization: string | null
}

type HitSource = {
  projectId?: string
  objectType?: string
  objectId?: string
  label?: string
  description?: string | null
  href?: string | null
  metadata?: Record<string, unknown>
}

type SearchHit = {
  _score?: number | null
  _source?: HitSource
}

type SearchResponse = {
  hits?: {
    total?: number | { value?: number }
    hits?: SearchHit[]
  }
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function basicAuthorization() {
  const username = process.env.OPENSEARCH_USERNAME?.trim()
  const password = process.env.OPENSEARCH_PASSWORD
  if (!username && !password) return null
  if (!username || password == null) throw new Error('OPENSEARCH_USERNAME and OPENSEARCH_PASSWORD must be configured together')
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
}

function config(): OpenSearchConfig {
  const prefix = (process.env.OPENSEARCH_INDEX_PREFIX ?? 'datanexus').trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(prefix)) throw new Error('OPENSEARCH_INDEX_PREFIX contains unsupported characters')
  return {
    endpoint: requireEnv('OPENSEARCH_ENDPOINT').replace(/\/$/, ''),
    index: `${prefix}-knowledge`,
    authorization: basicAuthorization(),
  }
}

function boundedLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 25
  return Math.max(1, Math.min(100, Math.trunc(value as number)))
}

function cursorOffset(value: string | null | undefined) {
  if (!value) return 0
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed < 0) return 0
  return Math.min(parsed, 9900)
}

function totalHits(total: SearchResponse['hits'] extends infer T ? T : never) {
  const value = (total as SearchResponse['hits'])?.total
  if (typeof value === 'number') return value
  return value?.value ?? 0
}

function metadataFilter(key: string, value: string | number | boolean | null) {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(key)) throw new Error(`Unsupported OpenSearch metadata filter key: ${key}`)
  return { term: { [`metadata.${key}`]: value } }
}

function toResult(hit: SearchHit): KnowledgeSearchResult | null {
  const source = hit._source
  if (!source?.projectId || !source.objectType || !source.objectId || !source.label) return null
  return {
    projectId: source.projectId,
    objectType: source.objectType,
    objectId: source.objectId,
    label: source.label,
    description: source.description ?? null,
    score: typeof hit._score === 'number' ? hit._score : 0,
    href: source.href ?? null,
    metadata: source.metadata ?? {},
  }
}

export class OpenSearchKnowledgeSearchProvider implements KnowledgeSearchProvider {
  readonly providerKey = 'opensearch'

  async search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
    const settings = config()
    const limit = boundedLimit(request.limit)
    const from = cursorOffset(request.cursor)
    const lexical = request.lexical !== false
    const queryText = request.query.trim()

    if (!lexical && request.semantic) {
      return {
        items: [],
        nextCursor: null,
        semanticStatus: 'NOT_CONFIGURED',
      }
    }

    const filters: Record<string, unknown>[] = [
      { term: { projectId: request.projectId } },
    ]
    if (request.objectTypes?.length) filters.push({ terms: { objectType: request.objectTypes } })
    for (const [key, value] of Object.entries(request.metadataFilters ?? {})) {
      filters.push(metadataFilter(key, value))
    }

    const query = queryText && lexical
      ? {
          bool: {
            filter: filters,
            must: [{
              multi_match: {
                query: queryText,
                fields: ['label^5', 'description^2', 'content'],
                type: 'best_fields',
                operator: 'and',
              },
            }],
          },
        }
      : { bool: { filter: filters } }

    const response = await fetch(`${settings.endpoint}/${encodeURIComponent(settings.index)}/_search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(settings.authorization ? { authorization: settings.authorization } : {}),
      },
      body: JSON.stringify({
        from,
        size: limit,
        track_total_hits: true,
        query,
        _source: ['projectId', 'objectType', 'objectId', 'label', 'description', 'href', 'metadata'],
      }),
      cache: 'no-store',
    })

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 2000)
      throw new Error(`OpenSearch knowledge query failed (${response.status}): ${detail || response.statusText}`)
    }

    const payload = await response.json() as SearchResponse
    const items = (payload.hits?.hits ?? []).map(toResult).filter((item): item is KnowledgeSearchResult => Boolean(item))
    const total = totalHits(payload.hits)
    const nextOffset = from + items.length

    return {
      items,
      nextCursor: nextOffset < total && nextOffset < 10000 ? String(nextOffset) : null,
      truncated: total > 10000,
      semanticStatus: request.semantic ? 'NOT_CONFIGURED' : 'SKIPPED',
    }
  }
}
