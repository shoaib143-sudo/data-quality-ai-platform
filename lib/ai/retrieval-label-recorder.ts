export type RetrievalRelevanceJudgmentInput = {
  objectKey: string
  relevance: number
}

export type HumanRetrievalRelevanceCaseInput = {
  projectId: string
  caseKey: string
  query: string
  evidenceRefs: string[]
  judgments: RetrievalRelevanceJudgmentInput[]
  reviewerUserId: string
  reviewerCapability: 'admin.manage'
}

export type HumanRetrievalRelevanceCaseReceipt = {
  caseVersionId: string
  authority: 'HUMAN_REVIEWED'
  persisted: true
}

export interface RetrievalLabelRecorder {
  readonly id: string
  recordHumanReviewedCase(input: HumanRetrievalRelevanceCaseInput): Promise<HumanRetrievalRelevanceCaseReceipt>
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function uniqueEvidenceRefs(values: string[]) {
  const refs = [...new Set(values.map((value) => value.trim()).filter(Boolean))]
  if (!refs.length) throw new Error('evidenceRefs requires at least one canonical reference')
  if (refs.length > 200) throw new Error('evidenceRefs must contain at most 200 references')
  return refs
}

function normalizeJudgments(values: RetrievalRelevanceJudgmentInput[]) {
  if (!Array.isArray(values) || !values.length) throw new Error('judgments requires at least one relevance judgment')
  const seen = new Set<string>()
  let positive = 0
  const judgments = values.map((value) => {
    const objectKey = requiredText(value.objectKey, 'objectKey')
    if (seen.has(objectKey)) throw new Error(`duplicate relevance judgment for objectKey ${objectKey}`)
    seen.add(objectKey)
    if (!Number.isInteger(value.relevance) || value.relevance < 0) {
      throw new Error('relevance must be a non-negative integer')
    }
    if (value.relevance > 0) positive += 1
    return { objectKey, relevance: value.relevance }
  })
  if (!positive) throw new Error('judgments requires at least one positive relevance judgment')
  return judgments
}

export function normalizeHumanRetrievalRelevanceCase(input: HumanRetrievalRelevanceCaseInput): HumanRetrievalRelevanceCaseInput {
  if (input.reviewerCapability !== 'admin.manage') throw new Error('reviewerCapability must be admin.manage')
  return {
    projectId: requiredText(input.projectId, 'projectId'),
    caseKey: requiredText(input.caseKey, 'caseKey'),
    query: requiredText(input.query, 'query'),
    evidenceRefs: uniqueEvidenceRefs(input.evidenceRefs),
    judgments: normalizeJudgments(input.judgments),
    reviewerUserId: requiredText(input.reviewerUserId, 'reviewerUserId'),
    reviewerCapability: 'admin.manage',
  }
}
