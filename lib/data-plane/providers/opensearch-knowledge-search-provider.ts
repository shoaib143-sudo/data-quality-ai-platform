import type {
  KnowledgeSearchProvider,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
} from '@/lib/data-plane/contracts'
import { getOpenSearchConnection, openSearchRequest } from '@/lib/data-plane/providers/opensearch-http'

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

function totalHits(hits: SearchResponse['hits']) {
  const value = hits?.total
  if (typeof value === 'number') return value
  return value?.value ?? 0
}

function facetValue(value: string | number | boolean | null) {
  return value === null ? '__NULL__' : String(value)
}

function metadataFilter(key: string, value: string | number | boolean | null) {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(key)) {
    throw new Error(`Unsupported OpenSearch metadata filter key: ${key}`)
  }
  return {
    nested: {
      path: 'facets',
      query: {
        bool: {
          filter: [
            { term: { 'facets.key': key } },
            { term: { 'facets.value': facetValue(value) } },
          ],
        },
      },
    },
  }
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

function lexicalQuery(queryText: string, filters: Record<string, unknown>[]) {
  if (!queryText) return { bool: { filter: filters } }
  return {
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
}

function semanticQuery(
  queryText: string,
  modelId: string,
  filters: Record<string, unknown>[],
  candidateCount: number,
) {
  return {
    neural: {
      embedding: {
        query_text: queryText,
        model_id: modelId,
        k: candidateCount,
        filter: { bool: { filter: filters } },
      },
    },
  }
}

export class OpenSearchKnowledgeSearchProvider implements KnowledgeSearchProvider {
  readonly providerKey = 'opensearch'

  async search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
    const connection = getOpenSearchConnection()
    const { knowledgeIndex } = connection
    const limit = boundedLimit(request.limit)
    const from = cursorOffset(request.cursor)
    const lexical = request.lexical !== false
    const semanticRequested = request.semantic === true
    const queryText = request.query.trim()

    const filters: Record<string, unknown>[] = [
      { term: { projectId: request.projectId } },
    ]
    if (request.objectTypes?.length) filters.push({ terms: { objectType: request.objectTypes } })
    for (const [key, value] of Object.entries(request.metadataFilters ?? {})) {
      filters.push(metadataFilter(key, value))
    }

    const semanticAvailable = connection.semanticEnabled && Boolean(connection.embeddingModelId) && Boolean(queryText)
    const candidateCount = Math.min(1000, Math.max(100, from + limit, limit * 4))

    let query: Record<string, unknown>
    let semanticStatus: KnowledgeSearchResponse['semanticStatus'] = semanticRequested ? 'NOT_CONFIGURED' : 'SKIPPED'
    let searchPath = `/${encodeURIComponent(knowledgeIndex)}/_search`

    if (semanticRequested && semanticAvailable && connection.embeddingModelId) {
      const neural = semanticQuery(queryText, connection.embeddingModelId, filters, candidateCount)
      semanticStatus = 'ENABLED'
      if (lexical) {
        query = {
          hybrid: {
            queries: [
              lexicalQuery(queryText, filters),
              neural,
            ],
          },
        }
        if (!connection.hybridSearchPipeline) throw new Error('OpenSearch hybrid search pipeline is not configured')
        searchPath += `?search_pipeline=${encodeURIComponent(connection.hybridSearchPipeline)}`
      } else {
        query = neural
      }
    } else if (lexical) {
      query = lexicalQuery(queryText, filters)
    } else {
      return {
        items: [],
        nextCursor: null,
        semanticStatus: semanticRequested && queryText ? 'NOT_CONFIGURED' : 'SKIPPED',
      }
    }

    const response = await openSearchRequest(searchPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        size: limit,
        track_total_hits: true,
        query,
        _source: ['projectId', 'objectType', 'objectId', 'label', 'description', 'href', 'metadata'],
      }),
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
      semanticStatus,
    }
  }
}
