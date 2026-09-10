export type RetrievalMode = 'lexical' | 'semantic' | 'graph' | 'temporal' | 'authority'

export type RetrievalObjectType = string

export type RetrievalAuthority = 'GOVERNED' | 'OBSERVATION' | 'UNVERIFIED'

export type RetrievalTemporalEvidence = {
  asOf: string
  validFrom: string | null
  validTo: string | null
  evidenceKeys: string[]
}

export type RetrievalRequest = {
  query: string
  projectIds: string[]
  objectTypes?: RetrievalObjectType[] | null
  modes?: RetrievalMode[]
  threshold?: number
  limit?: number
  /** Required when temporal mode is requested. Results without real temporal evidence fail closed. */
  asOf?: string
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
    /** Evidence classification only. It is never inferred from semantic similarity. */
    authority?: RetrievalAuthority
    authorityEvidenceKeys?: string[]
    temporal?: RetrievalTemporalEvidence
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
const GOVERNED_STATUS_VALUES = new Set(['APPROVED', 'CERTIFIED', 'VERIFIED', 'REVIEWED'])
const AUTHORITY_REFERENCE_KEYS = ['approved_by', 'certified_by', 'reviewed_by', 'decision_id', 'workflow_id', 'policy_version_id'] as const
const AUTHORITY_STATUS_KEYS = ['approval_status', 'certification_status', 'review_status'] as const
const TEMPORAL_START_KEYS = ['effective_from', 'valid_from', 'approved_at', 'certified_at', 'reviewed_at', 'observed_at', 'recorded_at', 'created_at'] as const
const TEMPORAL_END_KEYS = ['effective_to', 'valid_to'] as const

function nonEmpty(value: unknown) {
  return typeof value === 'string' ? Boolean(value.trim()) : value !== null && value !== undefined
}

function normalized(value: unknown) {
  return typeof value === 'string' ? value.trim().toUpperCase() : ''
}

/**
 * Classifies authority only from explicit governance evidence already stored with
 * the projection. Similarity, object type, source table and model output are not
 * governance authority and never upgrade a result.
 */
export function classifyRetrievalAuthority(metadata: Record<string, unknown>): {
  authority: RetrievalAuthority
  evidenceKeys: string[]
} {
  const referenceKeys = AUTHORITY_REFERENCE_KEYS.filter((key) => nonEmpty(metadata[key]))
  const statusKeys = AUTHORITY_STATUS_KEYS.filter((key) => GOVERNED_STATUS_VALUES.has(normalized(metadata[key])))
  const explicitEvidenceKeys = [
    ...(metadata.governed === true ? ['governed'] : []),
    ...(['GOVERNED', 'AUTHORITATIVE'].includes(normalized(metadata.authority)) ? ['authority'] : []),
  ]
  const explicitGoverned = explicitEvidenceKeys.length > 0
  const humanReviewed = metadata.human_reviewed === true && nonEmpty(metadata.reviewed_by)

  if (referenceKeys.length && (statusKeys.length || explicitGoverned || humanReviewed)) {
    const evidenceKeys = [...new Set([...referenceKeys, ...statusKeys, ...explicitEvidenceKeys, ...(humanReviewed ? ['human_reviewed'] : [])])]
    return { authority: 'GOVERNED', evidenceKeys }
  }

  const observationalKeys = ['observed_at', 'source_provider', 'source_revision_id', 'source_table'].filter((key) => nonEmpty(metadata[key]))
  if (observationalKeys.length) return { authority: 'OBSERVATION', evidenceKeys: observationalKeys }
  return { authority: 'UNVERIFIED', evidenceKeys: [] }
}

function parseTimestamp(value: unknown): number | null {
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : null
}

function collectTimestamps(metadata: Record<string, unknown>, keys: readonly string[]) {
  return keys.flatMap((key) => {
    const timestamp = parseTimestamp(metadata[key])
    return timestamp === null ? [] : [{ key, timestamp, value: new Date(timestamp).toISOString() }]
  })
}

/**
 * Builds an as-of envelope from explicit timestamps. A projection with no valid
 * timestamp evidence is not temporally authoritative and is excluded by temporal
 * mode rather than being assumed current.
 */
export function resolveRetrievalTemporalEvidence(metadata: Record<string, unknown>, asOf: string): RetrievalTemporalEvidence | null {
  const asOfTimestamp = Date.parse(asOf)
  if (!Number.isFinite(asOfTimestamp)) throw new Error('Temporal retrieval requires a valid asOf timestamp')

  const starts = collectTimestamps(metadata, TEMPORAL_START_KEYS)
  const ends = collectTimestamps(metadata, TEMPORAL_END_KEYS)
  if (!starts.length && !ends.length) return null

  const validFrom = starts.length ? starts.reduce((latest, entry) => entry.timestamp > latest.timestamp ? entry : latest) : null
  const validTo = ends.length ? ends.reduce((earliest, entry) => entry.timestamp < earliest.timestamp ? entry : earliest) : null
  if (validFrom && asOfTimestamp < validFrom.timestamp) return null
  if (validTo && asOfTimestamp > validTo.timestamp) return null

  return {
    asOf: new Date(asOfTimestamp).toISOString(),
    validFrom: validFrom?.value ?? null,
    validTo: validTo?.value ?? null,
    evidenceKeys: [...starts.map((entry) => entry.key), ...ends.map((entry) => entry.key)],
  }
}

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
    temporal: true,
    authority: true,
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
    const requiresAuthority = modes.includes('authority')
    const requiresTemporal = modes.includes('temporal')
    if (requiresTemporal && !request.asOf?.trim()) throw new Error('Temporal retrieval requires an asOf timestamp')
    if (requiresTemporal && !Number.isFinite(Date.parse(request.asOf!))) throw new Error('Temporal retrieval requires a valid asOf timestamp')

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
    const evidenceAwareLimit = requiresAuthority || requiresTemporal ? Math.min(100, perProjectLimit * 3) : perProjectLimit
    const groups = await mapWithConcurrency(projectIds, SEMANTIC_PROJECT_CONCURRENCY, async (projectId) => ({
      projectId,
      matches: await this.dependencies.searchProject({
        projectId,
        embedding,
        embeddingSpaceId,
        objectTypes: request.objectTypes,
        threshold: request.threshold,
        limit: evidenceAwareLimit,
      }),
    }))

    const matches = groups
      .flatMap(({ projectId, matches: projectMatches }) => projectMatches.flatMap((match): RetrievalMatch[] => {
        const metadata = match.metadata ?? {}
        const authority = classifyRetrievalAuthority(metadata)
        if (requiresAuthority && authority.authority !== 'GOVERNED') return []
        const temporal = requiresTemporal ? resolveRetrievalTemporalEvidence(metadata, request.asOf!) : null
        if (requiresTemporal && !temporal) return []
        return [{
          projectId,
          projectionId: match.id ?? null,
          objectType: match.object_type,
          objectKey: match.object_key,
          objectId: match.object_id,
          content: match.content,
          metadata,
          score: Math.max(0, Math.min(1, Number(match.similarity) || 0)),
          mode: 'semantic',
          provenance: {
            source: 'governance.semantic_embeddings',
            projection: true,
            embeddingSpaceId,
            authority: authority.authority,
            authorityEvidenceKeys: authority.evidenceKeys,
            ...(temporal ? { temporal } : {}),
          },
        }]
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, totalLimit)

    return { matches, modesApplied: modes, capabilities: this.capabilities }
  }
}
