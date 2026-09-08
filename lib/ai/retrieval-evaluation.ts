import type { EvaluationEngine } from './evaluation-engine'

export type RetrievalEvaluationCase = {
  caseId: string
  query: string
  rankedObjectKeys: string[]
  relevance: Record<string, number>
}

export type RetrievalEvaluationSummary = {
  caseCount: number
  mrrAtK: number
  ndcgAtK: number
  recallAtK: number
}

function boundedK(k: number) {
  if (!Number.isFinite(k) || k < 1) throw new Error('k must be a positive integer')
  return Math.floor(k)
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function relevanceGrade(value: number) {
  if (!Number.isFinite(value) || value < 0) throw new Error('relevance grades must be non-negative')
  return value
}

function dcg(grades: number[]) {
  return grades.reduce((total, grade, index) => total + ((2 ** grade) - 1) / Math.log2(index + 2), 0)
}

export function evaluateRetrieval(cases: RetrievalEvaluationCase[], k = 10): RetrievalEvaluationSummary {
  const limit = boundedK(k)
  if (!cases.length) throw new Error('retrieval evaluation requires at least one labeled case')

  let reciprocalRank = 0
  let normalizedDcg = 0
  let recall = 0

  for (const item of cases) {
    if (!item.caseId.trim()) throw new Error('caseId is required')
    if (!item.query.trim()) throw new Error('query is required')
    const ranked = unique(item.rankedObjectKeys).slice(0, limit)
    const relevance = new Map(Object.entries(item.relevance).map(([key, grade]) => [key.trim(), relevanceGrade(grade)]))
    const relevantKeys = [...relevance.entries()].filter(([, grade]) => grade > 0).map(([key]) => key)
    if (!relevantKeys.length) throw new Error(`case ${item.caseId} has no positive relevance judgments`)

    const firstRelevantIndex = ranked.findIndex((key) => (relevance.get(key) ?? 0) > 0)
    if (firstRelevantIndex >= 0) reciprocalRank += 1 / (firstRelevantIndex + 1)

    const rankedGrades = ranked.map((key) => relevance.get(key) ?? 0)
    const idealGrades = [...relevance.values()].sort((a, b) => b - a).slice(0, limit)
    const idealDcg = dcg(idealGrades)
    normalizedDcg += idealDcg > 0 ? dcg(rankedGrades) / idealDcg : 0

    const retrievedRelevant = relevantKeys.filter((key) => ranked.includes(key)).length
    recall += retrievedRelevant / relevantKeys.length
  }

  const count = cases.length
  return {
    caseCount: count,
    mrrAtK: reciprocalRank / count,
    ndcgAtK: normalizedDcg / count,
    recallAtK: recall / count,
  }
}

export async function recordRetrievalEvaluation(input: {
  engine: EvaluationEngine
  projectId: string
  providerId: string
  rerankerId?: string | null
  cases: RetrievalEvaluationCase[]
  k?: number
  evidenceRefs: string[]
  evaluatorVersion?: string
}) {
  const k = boundedK(input.k ?? 10)
  const summary = evaluateRetrieval(input.cases, k)
  const common = {
    projectId: input.projectId,
    evaluationType: 'RETRIEVAL_RELEVANCE',
    capability: 'retrieval',
    evaluatorType: 'DETERMINISTIC_RELEVANCE_JUDGMENT',
    evaluatorVersion: input.evaluatorVersion ?? '1',
    evidenceRefs: input.evidenceRefs,
    dimensions: {
      k,
      case_count: summary.caseCount,
      retrieval_provider_id: input.providerId,
      reranker_provider_id: input.rerankerId ?? null,
    },
  }

  const receipts = []
  for (const [metricName, score] of [
    [`MRR@${k}`, summary.mrrAtK],
    [`NDCG@${k}`, summary.ndcgAtK],
    [`RECALL@${k}`, summary.recallAtK],
  ] as const) {
    receipts.push(await input.engine.record({
      ...common,
      metricName,
      score,
      pass: null,
      metadata: { labeled_case_ids: input.cases.map((item) => item.caseId) },
    }))
  }

  return { summary, receipts }
}
