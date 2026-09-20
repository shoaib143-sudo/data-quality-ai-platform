import { collectProjectSemanticCandidates } from '@/lib/governance/semantic-indexer'
import { governanceEmbeddingSpaceIdentity, indexSemanticObject } from '@/lib/governance/semantic-search'

export type SemanticReembeddingRequest = {
  projectId: string
  model: string
  revision: string
  concurrency?: number
}

export type SemanticReembeddingResult = {
  projectId: string
  model: string
  revision: string
  providerId: string
  dimensions: number
  total: number
  indexed: number
  unchanged: number
  failed: number
  embeddingSpaceIds: string[]
  results: Array<{
    objectType: string
    objectKey: string
    status: 'INDEXED' | 'UNCHANGED' | 'FAILED'
    embeddingSpaceId?: string
    error?: string
  }>
}

function required(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

export async function reembedProjectSemanticObjects(
  input: SemanticReembeddingRequest,
  deps: {
    collect?: typeof collectProjectSemanticCandidates
    index?: typeof indexSemanticObject
  } = {},
): Promise<SemanticReembeddingResult> {
  const projectId = required(input.projectId, 'projectId')
  const model = required(input.model, 'embedding model')
  const revision = required(input.revision, 'embedding revision')
  const concurrency = Math.max(1, Math.min(8, input.concurrency ?? 3))
  const collect = deps.collect ?? collectProjectSemanticCandidates
  const index = deps.index ?? indexSemanticObject

  const identity = governanceEmbeddingSpaceIdentity(model, revision)
  const candidates = await collect(projectId)
  const results: SemanticReembeddingResult['results'] = new Array(candidates.length)
  let cursor = 0

  async function worker() {
    while (true) {
      const indexPosition = cursor++
      if (indexPosition >= candidates.length) return
      const candidate = candidates[indexPosition]
      try {
        const indexed = await index({
          projectId,
          ...candidate,
          embeddingModel: model,
          embeddingVersion: revision,
        })
        results[indexPosition] = {
          objectType: candidate.objectType,
          objectKey: candidate.objectKey,
          status: indexed.unchanged ? 'UNCHANGED' : 'INDEXED',
          embeddingSpaceId: String(indexed.embedding_space_id),
        }
      } catch (error) {
        results[indexPosition] = {
          objectType: candidate.objectType,
          objectKey: candidate.objectKey,
          status: 'FAILED',
          error: error instanceof Error ? error.message : String(error),
        }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, Math.max(1, candidates.length)) }, () => worker()),
  )

  const embeddingSpaceIds = [...new Set(
    results
      .map((result) => result.embeddingSpaceId)
      .filter((value): value is string => Boolean(value)),
  )]

  return {
    projectId,
    model,
    revision,
    providerId: identity.providerId,
    dimensions: identity.dimensions,
    total: candidates.length,
    indexed: results.filter((result) => result.status === 'INDEXED').length,
    unchanged: results.filter((result) => result.status === 'UNCHANGED').length,
    failed: results.filter((result) => result.status === 'FAILED').length,
    embeddingSpaceIds,
    results,
  }
}
