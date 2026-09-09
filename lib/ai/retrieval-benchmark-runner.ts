import type { EvaluationEngine } from './evaluation-engine'
import type { GovernedRetrievalEvaluationDataset } from './retrieval-evaluation-dataset'
import { recordRetrievalEvaluation } from './retrieval-evaluation'
import type { RetrievalProvider } from './retrieval-provider'

export type RetrievalBenchmarkRequest = {
  projectId: string
  dataset: GovernedRetrievalEvaluationDataset
  retrieval: RetrievalProvider
  evaluationEngine: EvaluationEngine
  k?: number
}

export type RetrievalBenchmarkResult = {
  projectId: string
  providerId: string
  rerankerId: string | null
  caseCount: number
  k: number
  summary: {
    caseCount: number
    mrrAtK: number
    ndcgAtK: number
    recallAtK: number
  }
  evaluationResultIds: string[]
}

function boundedK(value: number | undefined) {
  const k = value ?? 10
  if (!Number.isInteger(k) || k < 1 || k > 100) throw new Error('k must be an integer between 1 and 100')
  return k
}

function rerankerId(matches: Array<{ provenance: { rerankedBy?: string } }>) {
  const ids = [...new Set(matches.map((match) => match.provenance.rerankedBy).filter((value): value is string => Boolean(value)))]
  if (ids.length > 1) throw new Error('retrieval benchmark observed multiple reranker providers in one run')
  return ids[0] ?? null
}

export async function runRetrievalBenchmark(request: RetrievalBenchmarkRequest): Promise<RetrievalBenchmarkResult> {
  const projectId = request.projectId.trim()
  if (!projectId) throw new Error('projectId is required')
  if (request.dataset.projectId !== projectId) throw new Error('retrieval benchmark dataset project mismatch')
  if (!request.dataset.cases.length) throw new Error('retrieval benchmark requires governed labeled cases')
  const k = boundedK(request.k)

  let observedRerankerId: string | null = null
  const rankedCases = []
  for (const item of request.dataset.cases) {
    const response = await request.retrieval.retrieve({
      query: item.query,
      projectIds: [projectId],
      limit: k,
    })
    const currentRerankerId = rerankerId(response.matches)
    if (observedRerankerId && currentRerankerId && observedRerankerId !== currentRerankerId) {
      throw new Error('retrieval benchmark reranker changed between labeled cases')
    }
    observedRerankerId = observedRerankerId ?? currentRerankerId
    rankedCases.push({
      ...item,
      rankedObjectKeys: response.matches.map((match) => match.objectKey),
    })
  }

  const recorded = await recordRetrievalEvaluation({
    engine: request.evaluationEngine,
    projectId,
    providerId: request.retrieval.id,
    rerankerId: observedRerankerId,
    cases: rankedCases,
    k,
    evidenceRefs: request.dataset.evidenceRefs,
    evaluatorVersion: '2',
  })

  return {
    projectId,
    providerId: request.retrieval.id,
    rerankerId: observedRerankerId,
    caseCount: rankedCases.length,
    k,
    summary: recorded.summary,
    evaluationResultIds: recorded.receipts.map((receipt) => receipt.evaluationResultId),
  }
}
