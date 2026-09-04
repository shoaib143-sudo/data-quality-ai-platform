import type {
  KnowledgeSearchProvider,
  KnowledgeSearchRequest,
  KnowledgeSearchResponse,
  KnowledgeSearchResult,
} from '@/lib/data-plane/contracts'
import { createAdminClient } from '@/lib/supabase/admin'

type SemanticRow = {
  object_type: string
  object_key: string
  object_id: string | null
  content: string
  metadata: Record<string, unknown> | null
}

function boundedLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 25
  return Math.max(1, Math.min(100, Math.trunc(value as number)))
}

function cursorOffset(value: string | null | undefined) {
  if (!value) return 0
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function metadataMatches(metadata: Record<string, unknown>, filters: Record<string, string | number | boolean | null>) {
  return Object.entries(filters).every(([key, expected]) => metadata[key] === expected)
}

function textMetadata(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function toResult(projectId: string, row: SemanticRow): KnowledgeSearchResult {
  const metadata = row.metadata ?? {}
  const label = textMetadata(metadata, 'label')
    ?? textMetadata(metadata, 'title')
    ?? textMetadata(metadata, 'name')
    ?? row.object_key
  return {
    projectId,
    objectType: row.object_type,
    objectId: row.object_id ?? row.object_key,
    label,
    description: textMetadata(metadata, 'description') ?? row.content.slice(0, 500),
    score: 1,
    href: textMetadata(metadata, 'href'),
    metadata,
  }
}

export class PostgresKnowledgeSearchProvider implements KnowledgeSearchProvider {
  readonly providerKey = 'postgres'

  async search(request: KnowledgeSearchRequest): Promise<KnowledgeSearchResponse> {
    const limit = boundedLimit(request.limit)
    const offset = cursorOffset(request.cursor)
    const lexical = request.lexical !== false
    const queryText = request.query.trim()

    if (!lexical && request.semantic) {
      return { items: [], nextCursor: null, semanticStatus: 'NOT_CONFIGURED' }
    }

    const admin = createAdminClient()
    const candidateLimit = Math.min(500, Math.max(limit * 5, limit))
    let query = admin
      .schema('governance')
      .from('semantic_embeddings')
      .select('object_type,object_key,object_id,content,metadata')
      .eq('project_id', request.projectId)
      .range(offset, offset + candidateLimit - 1)

    if (request.objectTypes?.length) query = query.in('object_type', request.objectTypes)
    if (queryText && lexical) query = query.ilike('content', `%${queryText}%`)

    const { data, error } = await query
    if (error) throw new Error(`PostgreSQL knowledge search failed: ${error.message}`)

    const metadataFilters = request.metadataFilters ?? {}
    const candidates = (data ?? []) as SemanticRow[]
    const filtered = Object.keys(metadataFilters).length
      ? candidates.filter((row) => metadataMatches(row.metadata ?? {}, metadataFilters))
      : candidates
    const items = filtered.slice(0, limit).map((row) => toResult(request.projectId, row))
    const consumed = candidates.length

    return {
      items,
      nextCursor: consumed === candidateLimit ? String(offset + consumed) : null,
      semanticStatus: request.semantic ? 'NOT_CONFIGURED' : 'SKIPPED',
    }
  }
}
