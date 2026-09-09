import type { RetrievalEvaluationCase } from './retrieval-evaluation'

export type RetrievalJudgmentAuthority = 'HUMAN_REVIEWED' | 'GOVERNED_IMPORT'

export type RetrievalRelevanceJudgment = {
  objectKey: string
  relevance: number
}

export type GovernedRetrievalEvaluationRecord = {
  caseId: string
  projectId: string
  query: string
  judgments: RetrievalRelevanceJudgment[]
  authority: RetrievalJudgmentAuthority
  evidenceRefs: string[]
  reviewedBy?: string | null
  reviewedAt?: string | null
}

export type GovernedRetrievalEvaluationDataset = {
  datasetKind: 'governed_retrieval_relevance'
  projectId: string
  cases: RetrievalEvaluationCase[]
  evidenceRefs: string[]
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function normalizedEvidenceRefs(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function relevanceGrade(value: number) {
  if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    throw new Error('retrieval relevance judgments must be non-negative integer grades')
  }
  return value
}

function assertAuthority(record: GovernedRetrievalEvaluationRecord) {
  if (record.authority === 'HUMAN_REVIEWED') {
    requiredText(record.reviewedBy ?? '', 'reviewedBy')
    const reviewedAt = new Date(record.reviewedAt ?? '')
    if (Number.isNaN(reviewedAt.getTime())) throw new Error('reviewedAt is required for HUMAN_REVIEWED judgments')
  }
}

export function buildGovernedRetrievalEvaluationDataset(input: {
  projectId: string
  records: GovernedRetrievalEvaluationRecord[]
}): GovernedRetrievalEvaluationDataset {
  const projectId = requiredText(input.projectId, 'projectId')
  const cases: RetrievalEvaluationCase[] = []
  const datasetEvidenceRefs = new Set<string>()

  for (const record of input.records) {
    if (record.projectId !== projectId) continue
    const caseId = requiredText(record.caseId, 'caseId')
    const query = requiredText(record.query, 'query')
    assertAuthority(record)

    const evidenceRefs = normalizedEvidenceRefs(record.evidenceRefs)
    if (evidenceRefs.length === 0) throw new Error(`case ${caseId} requires canonical evidenceRefs`)

    const relevance: Record<string, number> = {}
    for (const judgment of record.judgments) {
      const objectKey = requiredText(judgment.objectKey, 'objectKey')
      relevance[objectKey] = relevanceGrade(judgment.relevance)
    }

    if (!Object.values(relevance).some((grade) => grade > 0)) {
      throw new Error(`case ${caseId} requires at least one positive relevance judgment`)
    }

    evidenceRefs.forEach((ref) => datasetEvidenceRefs.add(ref))
    cases.push({
      caseId,
      query,
      rankedObjectKeys: [],
      relevance,
    })
  }

  return {
    datasetKind: 'governed_retrieval_relevance',
    projectId,
    cases,
    evidenceRefs: [...datasetEvidenceRefs],
  }
}
