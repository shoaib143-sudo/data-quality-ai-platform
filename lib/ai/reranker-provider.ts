import type {
  RetrievalCapabilities,
  RetrievalMatch,
  RetrievalProvider,
  RetrievalRequest,
  RetrievalResponse,
} from './retrieval-provider'

export type RerankerRequest = {
  query: string
  candidates: RetrievalMatch[]
  limit: number
}

export type RerankerResponse = {
  matches: RetrievalMatch[]
  providerId: string
}

export interface RerankerProvider {
  readonly id: string
  rerank(request: RerankerRequest): Promise<RerankerResponse>
}

function tokens(value: string) {
  return [...new Set((value.toLowerCase().match(/[\p{L}\p{N}_]+/gu) ?? []).filter((token) => token.length > 1))]
}

function lexicalCoverage(query: string, content: string) {
  const queryTokens = tokens(query)
  if (!queryTokens.length) return 0
  const contentTokens = new Set(tokens(content))
  const matched = queryTokens.filter((token) => contentTokens.has(token)).length
  return matched / queryTokens.length
}

function phraseMatch(query: string, content: string) {
  const normalizedQuery = query.trim().toLowerCase().replace(/\s+/g, ' ')
  const normalizedContent = content.toLowerCase().replace(/\s+/g, ' ')
  return normalizedQuery.length >= 3 && normalizedContent.includes(normalizedQuery) ? 1 : 0
}

function bounded(value: number) {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(1, value))
}

/**
 * Reproducible first-stage reranker. It deliberately uses no LLM and makes no
 * authority or temporal claims. A model-backed reranker can replace this
 * provider after DataNexus-specific evaluation without changing retrieval APIs.
 */
export class DeterministicRelevanceReranker implements RerankerProvider {
  readonly id = 'deterministic_relevance_v1'

  async rerank(request: RerankerRequest): Promise<RerankerResponse> {
    const query = request.query.trim()
    if (!query) throw new Error('Reranker query is required')
    const limit = Math.max(1, Math.min(100, Math.floor(request.limit || 1)))

    const scored = request.candidates.map((candidate, index) => {
      const baseScore = bounded(candidate.baseScore ?? candidate.score)
      const coverage = lexicalCoverage(query, candidate.content)
      const phrase = phraseMatch(query, candidate.content)
      const rerankScore = bounded((baseScore * 0.8) + (coverage * 0.15) + (phrase * 0.05))
      return {
        index,
        rerankScore,
        match: {
          ...candidate,
          baseScore,
          score: rerankScore,
          provenance: {
            ...candidate.provenance,
            rerankedBy: this.id,
          },
        } satisfies RetrievalMatch,
      }
    })

    scored.sort((a, b) => b.rerankScore - a.rerankScore || b.match.baseScore! - a.match.baseScore! || a.index - b.index)
    return { matches: scored.slice(0, limit).map((entry) => entry.match), providerId: this.id }
  }
}

export class RerankingRetrievalProvider implements RetrievalProvider {
  readonly id: string
  readonly capabilities: RetrievalCapabilities
  private readonly retrieval: RetrievalProvider
  private readonly reranker: RerankerProvider
  private readonly candidateMultiplier: number

  constructor(retrieval: RetrievalProvider, reranker: RerankerProvider, candidateMultiplier = 3) {
    this.retrieval = retrieval
    this.reranker = reranker
    this.candidateMultiplier = candidateMultiplier
    this.id = `${retrieval.id}+${reranker.id}`
    this.capabilities = retrieval.capabilities
  }

  async retrieve(request: RetrievalRequest): Promise<RetrievalResponse> {
    const finalLimit = Math.max(1, Math.min(100, request.limit ?? 75))
    const candidateLimit = Math.min(100, Math.max(finalLimit, Math.ceil(finalLimit * this.candidateMultiplier)))
    const retrieved = await this.retrieval.retrieve({ ...request, limit: candidateLimit })
    if (!retrieved.matches.length) return retrieved

    const reranked = await this.reranker.rerank({
      query: request.query,
      candidates: retrieved.matches,
      limit: finalLimit,
    })

    return {
      ...retrieved,
      matches: reranked.matches,
    }
  }
}
