export type RetrievalMode = 'lexical' | 'semantic' | 'graph' | 'temporal' | 'authority'

export type RetrievalObjectType = string

export type RetrievalAuthorityClass =
  | 'GOVERNED_DECISION'
  | 'AUTHORITATIVE_FACT'
  | 'OBSERVED_EVIDENCE'
  | 'DERIVED_INTELLIGENCE'
  | 'UNTRUSTED_INFERENCE'
  | 'UNKNOWN'

export type RetrievalTemporalStatus = 'VALID' | 'MISSING' | 'INVALID' | 'FUTURE'

export type RetrievalMetadataNormalization = {
  version: '1'
  authorityClass: RetrievalAuthorityClass
  authoritySource: string | null
  temporalStatus: RetrievalTemporalStatus
  temporalValue: string | null
  temporalSource: string | null
}

const AUTHORITY_KEYS = ['authority_class', 'authority_status', 'authority', 'evidence_authority'] as const
const TEMPORAL_KEYS = ['effective_at', 'observed_at', 'source_updated_at', 'updated_at', 'created_at'] as const

const AUTHORITY_ALIASES: Record<string, RetrievalAuthorityClass> = {
  GOVERNED_DECISION: 'GOVERNED_DECISION',
  APPROVED: 'GOVERNED_DECISION',
  GOVERNED: 'GOVERNED_DECISION',
  HUMAN_REVIEWED: 'GOVERNED_DECISION',
  AUTHORITATIVE_FACT: 'AUTHORITATIVE_FACT',
  AUTHORITATIVE: 'AUTHORITATIVE_FACT',
  CANONICAL: 'AUTHORITATIVE_FACT',
  OBSERVED_EVIDENCE: 'OBSERVED_EVIDENCE',
  SOURCE_OBSERVED: 'OBSERVED_EVIDENCE',
  OBSERVED: 'OBSERVED_EVIDENCE',
  VERIFIED: 'OBSERVED_EVIDENCE',
  DERIVED_INTELLIGENCE: 'DERIVED_INTELLIGENCE',
  DERIVED: 'DERIVED_INTELLIGENCE',
  AI_GENERATED: 'UNTRUSTED_INFERENCE',
  INFERRED: 'UNTRUSTED_INFERENCE',
  UNVERIFIED: 'UNTRUSTED_INFERENCE',
}

function normalizedToken(value: unknown) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toUpperCase().replace(/[\s-]+/g, '_')
  return normalized || null
}

function normalizeAuthority(metadata: Record<string, unknown>) {
  for (const key of AUTHORITY_KEYS) {
    const token = normalizedToken(metadata[key])
    if (!token) continue
    return {
      authorityClass: AUTHORITY_ALIASES[token] ?? 'UNKNOWN' as RetrievalAuthorityClass,
      authoritySource: key,
    }
  }
  return { authorityClass: 'UNKNOWN' as const, authoritySource: null }
}

function normalizeTemporal(metadata: Record<string, unknown>, now: Date) {
  for (const key of TEMPORAL_KEYS) {
    const raw = metadata[key]
    if (raw == null || raw === '') continue
    if (typeof raw !== 'string' && typeof raw !== 'number') {
      return { temporalStatus: 'INVALID' as const, temporalValue: null, temporalSource: key }
    }
    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) {
      return { temporalStatus: 'INVALID' as const, temporalValue: null, temporalSource: key }
    }
    if (parsed.getTime() > now.getTime() + 5 * 60_000) {
      return { temporalStatus: 'FUTURE' as const, temporalValue: parsed.toISOString(), temporalSource: key }
    }
    return { temporalStatus: 'VALID' as const, temporalValue: parsed.toISOString(), temporalSource: key }
  }
  return { temporalStatus: 'MISSING' as const, temporalValue: null, temporalSource: null }
}

/**
 * Stable, non-authoritative projection over heterogeneous embedding metadata.
 * It never changes source metadata or ranking scores. Unknown/invalid values remain explicit
 * so downstream ranking cannot silently treat missing evidence as trusted or fresh.
 */
export function normalizeRetrievalMetadata(
  metadata: Record<string, unknown> | null | undefined,
  now = new Date(),
): RetrievalMetadataNormalization {
  const source = metadata ?? {}
  return {
    version: '1',
    ...normalizeAuthority(source),
    ...normalizeTemporal(source, now),
  }
}

export function withNormalizedRetrievalMetadata(
  metadata: Record<string, unknown> | null | undefined,
  now = new Date(),
): Record<string, unknown> {
  const source = metadata ?? {}
  return {
    ...source,
    retrieval_normalization: normalizeRetrievalMetadata(source, now),
  }
}

export type RetrievalRequest = {
  query: string
  projectIds: string[]
  objectTypes?: RetrievalObjectType[] | null
  modes?: RetrievalMode[]
  threshold?: number
  limit?: number
}

export type RetrievalMatch = {
  projectId: string
  projectionId: string | null
  objectType: string
  objectKey: string
  objectId: string | null
  content: string
  metadata: Record<string, unknown>
  /** Current ranking score. After a reranking stage this is the rerank score. */
  score: number
  /** Original retrieval score preserved when a reranker changes ranking. */
  baseScore?: number
  mode: RetrievalMode
  provenance: {
    source: string
    projection: boolean
    embeddingSpaceId?: string
    rerankedBy?: string
  }
}

export type RetrievalCapabilities = Record<RetrievalMode, boolean>

export type RetrievalResponse = {
  matches: RetrievalMatch[]
  modesApplied: RetrievalMode[]
  capabilities: RetrievalCapabilities
}

export interface RetrievalProvider {
  readonly id: string
  readonly capabilities: RetrievalCapabilities
  retrieve(request: RetrievalRequest): Promise<RetrievalResponse>
}

export type SemanticProjectionMatch = {
  id?: string | null
  object_type: string
  object_key: string
  object_id: string | null
  content: string
  metadata: Record<string, unknown>
  similarity: number
}

export type SemanticQueryEmbedding = {
  embedding: number[]
  embeddingSpaceId: string
}

export type SemanticRetrievalDependencies = {
  embedQuery(query: string): Promise<SemanticQueryEmbedding>
  searchProject(input: {
    projectId: string
    embedding: number[]
    embeddingSpaceId: string
    objectTypes?: string[] | null
    threshold?: number
    limit?: number
  }): Promise<SemanticProjectionMatch[]>
}

const SEMANTIC_PROJECT_CONCURRENCY = 4

async function mapWithConcurrency<T, R>(items: T[], concurrency: number, mapper: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length)
  let cursor = 0
  async function worker() {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await mapper(items[index])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, () => worker()))
  return results
}

export class SemanticProjectionRetrievalProvider implements RetrievalProvider {
  readonly id = 'governance_semantic_projection'
  readonly capabilities: RetrievalCapabilities = {
    lexical: false,
    semantic: true,
    graph: false,
    temporal: false,
    authority: false,
  }

  private readonly dependencies: SemanticRetrievalDependencies

  constructor(dependencies: SemanticRetrievalDependencies) {
    this.dependencies = dependencies
  }

  async retrieve(request: RetrievalRequest): Promise<RetrievalResponse> {
    const modes = request.modes?.length ? [...new Set(request.modes)] : ['semantic'] as RetrievalMode[]
    const unsupported = modes.filter((mode) => !this.capabilities[mode])
    if (unsupported.length) {
      throw new Error(`Retrieval provider ${this.id} does not support requested modes: ${unsupported.join(', ')}`)
    }

    const query = request.query.trim()
    if (!query) throw new Error('Retrieval query is required')
    const projectIds = [...new Set(request.projectIds.filter(Boolean))]
    if (!projectIds.length) return { matches: [], modesApplied: modes, capabilities: this.capabilities }

    const queryEmbedding = await this.dependencies.embedQuery(query)
    if (!queryEmbedding.embeddingSpaceId?.trim()) {
      throw new Error('Semantic retrieval requires an exact embeddingSpaceId')
    }
    const embedding = queryEmbedding.embedding
    const embeddingSpaceId = queryEmbedding.embeddingSpaceId.trim()
    const totalLimit = Math.max(1, Math.min(100, request.limit ?? 75))
    const perProjectLimit = Math.max(5, Math.ceil(totalLimit / projectIds.length))
    const groups = await mapWithConcurrency(projectIds, SEMANTIC_PROJECT_CONCURRENCY, async (projectId) => ({
      projectId,
      matches: await this.dependencies.searchProject({
        projectId,
        embedding,
        embeddingSpaceId,
        objectTypes: request.objectTypes,
        threshold: request.threshold,
        limit: perProjectLimit,
      }),
    }))

    const matches = groups
      .flatMap(({ projectId, matches: projectMatches }) => projectMatches.map((match): RetrievalMatch => ({
        projectId,
        projectionId: match.id ?? null,
        objectType: match.object_type,
        objectKey: match.object_key,
        objectId: match.object_id,
        content: match.content,
        metadata: withNormalizedRetrievalMetadata(match.metadata),
        score: Math.max(0, Math.min(1, Number(match.similarity) || 0)),
        mode: 'semantic',
        provenance: {
          source: 'governance.semantic_embeddings',
          projection: true,
          embeddingSpaceId,
        },
      })))
      .sort((a, b) => b.score - a.score)
      .slice(0, totalLimit)

    return { matches, modesApplied: modes, capabilities: this.capabilities }
  }
}
