export type RetrievalMode = 'lexical' | 'semantic' | 'graph' | 'temporal' | 'authority'

export type RetrievalObjectType = string

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

export type SemanticRetrievalDependencies = {
  embedQuery(query: string): Promise<number[]>
  searchProject(input: {
    projectId: string
    embedding: number[]
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

    const embedding = await this.dependencies.embedQuery(query)
    const totalLimit = Math.max(1, Math.min(100, request.limit ?? 75))
    const perProjectLimit = Math.max(5, Math.ceil(totalLimit / projectIds.length))
    const groups = await mapWithConcurrency(projectIds, SEMANTIC_PROJECT_CONCURRENCY, async (projectId) => ({
      projectId,
      matches: await this.dependencies.searchProject({
        projectId,
        embedding,
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
        metadata: match.metadata ?? {},
        score: Math.max(0, Math.min(1, Number(match.similarity) || 0)),
        mode: 'semantic',
        provenance: {
          source: 'governance.semantic_embeddings',
          projection: true,
        },
      })))
      .sort((a, b) => b.score - a.score)
      .slice(0, totalLimit)

    return { matches, modesApplied: modes, capabilities: this.capabilities }
  }
}
