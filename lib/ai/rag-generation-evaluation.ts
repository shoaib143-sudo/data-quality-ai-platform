import type { EvaluationEngine } from './evaluation-engine'

export type RagAuthorityLevel = 'UNVERIFIED' | 'REFERENCE' | 'APPROVED' | 'AUTHORITATIVE'

export type RagCitation = {
  citationId: string
  projectId: string
  objectKey: string
  projectionId?: string | null
  sourceId?: string | null
  authority: RagAuthorityLevel
  effectiveFrom?: string | null
  effectiveTo?: string | null
}

export type RagClaim = {
  claimId: string
  text: string
  factual: boolean
  citationIds: string[]
}

export type RagAnswerEnvelope = {
  answer: string
  refused: boolean
  refusalReason?: string | null
  claims: RagClaim[]
  citations: RagCitation[]
}

export type RagGenerationEvaluationCase = {
  caseId: string
  asOf: string
  expectedRefusal: boolean
  minimumAuthority?: RagAuthorityLevel
  requiredClaimIds?: string[]
  expectedSupportByClaim?: Record<string, string[]>
  prohibitedCitationIds?: string[]
}

export type RagGenerationEvaluationResult = {
  caseId: string
  passed: boolean
  citationPrecision: number
  citationCompleteness: number
  groundedClaimRate: number
  authorityValidity: number
  temporalValidity: number
  refusalCorrectness: number
  missingRequiredClaimIds: string[]
  invalidCitationIds: string[]
  unsupportedClaimIds: string[]
  staleCitationIds: string[]
  insufficientAuthorityCitationIds: string[]
}

const AUTHORITY_RANK: Record<RagAuthorityLevel, number> = {
  UNVERIFIED: 0,
  REFERENCE: 1,
  APPROVED: 2,
  AUTHORITATIVE: 3,
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function isoInstant(value: string, label: string) {
  const timestamp = Date.parse(requiredText(value, label))
  if (!Number.isFinite(timestamp)) throw new Error(`${label} must be an ISO timestamp`)
  return timestamp
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function ratio(numerator: number, denominator: number) {
  return denominator === 0 ? 1 : numerator / denominator
}

export function citationEffectiveAt(citation: RagCitation, asOf: string) {
  const point = isoInstant(asOf, 'asOf')
  const from = citation.effectiveFrom ? isoInstant(citation.effectiveFrom, 'citation.effectiveFrom') : Number.NEGATIVE_INFINITY
  const to = citation.effectiveTo ? isoInstant(citation.effectiveTo, 'citation.effectiveTo') : Number.POSITIVE_INFINITY
  return from <= point && point < to
}

export function compareCitationAuthority(left: RagCitation, right: RagCitation) {
  const rank = AUTHORITY_RANK[right.authority] - AUTHORITY_RANK[left.authority]
  if (rank !== 0) return rank
  return left.citationId.localeCompare(right.citationId)
}

export function validateRagAnswerEnvelope(envelope: RagAnswerEnvelope) {
  requiredText(envelope.answer, 'answer')
  const citationIds = new Set<string>()
  for (const citation of envelope.citations) {
    const citationId = requiredText(citation.citationId, 'citationId')
    if (citationIds.has(citationId)) throw new Error(`Duplicate citation id: ${citationId}`)
    citationIds.add(citationId)
    requiredText(citation.projectId, 'citation.projectId')
    requiredText(citation.objectKey, 'citation.objectKey')
    if (!(citation.authority in AUTHORITY_RANK)) throw new Error(`Unsupported citation authority: ${citation.authority}`)
  }

  const claimIds = new Set<string>()
  for (const claim of envelope.claims) {
    const claimId = requiredText(claim.claimId, 'claimId')
    if (claimIds.has(claimId)) throw new Error(`Duplicate claim id: ${claimId}`)
    claimIds.add(claimId)
    requiredText(claim.text, 'claim.text')
    claim.citationIds = unique(claim.citationIds)
  }

  if (envelope.refused && envelope.claims.some((claim) => claim.factual)) {
    throw new Error('A refused RAG answer cannot contain factual claims')
  }
  return envelope
}

export function evaluateRagGeneration(
  envelopeInput: RagAnswerEnvelope,
  benchmark: RagGenerationEvaluationCase,
): RagGenerationEvaluationResult {
  const envelope = validateRagAnswerEnvelope(envelopeInput)
  const asOf = new Date(isoInstant(benchmark.asOf, 'benchmark.asOf')).toISOString()
  const citations = new Map(envelope.citations.map((citation) => [citation.citationId, citation]))
  const prohibited = new Set(unique(benchmark.prohibitedCitationIds ?? []))
  const expectedSupport = new Map(
    Object.entries(benchmark.expectedSupportByClaim ?? {}).map(([claimId, citationIds]) => [claimId, new Set(unique(citationIds))]),
  )

  const factualClaims = envelope.claims.filter((claim) => claim.factual)
  const usedCitationIds = unique(factualClaims.flatMap((claim) => claim.citationIds))
  const validCitationIds = usedCitationIds.filter((citationId) => citations.has(citationId) && !prohibited.has(citationId))
  const invalidCitationIds = usedCitationIds.filter((citationId) => !citations.has(citationId) || prohibited.has(citationId))

  const claimsWithCitation = factualClaims.filter((claim) => claim.citationIds.some((citationId) => citations.has(citationId) && !prohibited.has(citationId)))
  const unsupportedClaimIds = factualClaims
    .filter((claim) => {
      const expected = expectedSupport.get(claim.claimId)
      if (!expected || expected.size === 0) return claim.citationIds.length === 0
      return !claim.citationIds.some((citationId) => expected.has(citationId))
    })
    .map((claim) => claim.claimId)

  const minimumAuthority = benchmark.minimumAuthority ?? 'REFERENCE'
  const staleCitationIds = validCitationIds.filter((citationId) => !citationEffectiveAt(citations.get(citationId)!, asOf))
  const insufficientAuthorityCitationIds = validCitationIds.filter(
    (citationId) => AUTHORITY_RANK[citations.get(citationId)!.authority] < AUTHORITY_RANK[minimumAuthority],
  )
  const requiredClaimIds = new Set(unique(benchmark.requiredClaimIds ?? []))
  const actualClaimIds = new Set(envelope.claims.map((claim) => claim.claimId))
  const missingRequiredClaimIds = [...requiredClaimIds].filter((claimId) => !actualClaimIds.has(claimId))

  const refusalCorrectness = envelope.refused === benchmark.expectedRefusal ? 1 : 0
  const citationPrecision = ratio(validCitationIds.length, usedCitationIds.length)
  const citationCompleteness = ratio(claimsWithCitation.length, factualClaims.length)
  const groundedClaimRate = ratio(factualClaims.length - unsupportedClaimIds.length, factualClaims.length)
  const authorityValidity = ratio(validCitationIds.length - insufficientAuthorityCitationIds.length, validCitationIds.length)
  const temporalValidity = ratio(validCitationIds.length - staleCitationIds.length, validCitationIds.length)

  const passed = refusalCorrectness === 1
    && citationPrecision === 1
    && citationCompleteness === 1
    && groundedClaimRate === 1
    && authorityValidity === 1
    && temporalValidity === 1
    && missingRequiredClaimIds.length === 0

  return {
    caseId: requiredText(benchmark.caseId, 'benchmark.caseId'),
    passed,
    citationPrecision,
    citationCompleteness,
    groundedClaimRate,
    authorityValidity,
    temporalValidity,
    refusalCorrectness,
    missingRequiredClaimIds,
    invalidCitationIds,
    unsupportedClaimIds,
    staleCitationIds,
    insufficientAuthorityCitationIds,
  }
}

export function summarizeRagGenerationEvaluation(results: RagGenerationEvaluationResult[]) {
  if (!results.length) throw new Error('RAG generation evaluation requires at least one result')
  const average = (key: keyof Pick<RagGenerationEvaluationResult,
    'citationPrecision' | 'citationCompleteness' | 'groundedClaimRate' | 'authorityValidity' | 'temporalValidity' | 'refusalCorrectness'>) =>
    results.reduce((total, result) => total + result[key], 0) / results.length

  return {
    caseCount: results.length,
    passRate: results.filter((result) => result.passed).length / results.length,
    citationPrecision: average('citationPrecision'),
    citationCompleteness: average('citationCompleteness'),
    groundedClaimRate: average('groundedClaimRate'),
    authorityValidity: average('authorityValidity'),
    temporalValidity: average('temporalValidity'),
    refusalCorrectness: average('refusalCorrectness'),
  }
}

export async function recordRagGenerationEvaluation(input: {
  engine: EvaluationEngine
  projectId: string
  providerId: string
  modelName: string
  results: RagGenerationEvaluationResult[]
  evidenceRefs: string[]
  benchmarkSuiteVersion: string
  evaluatorVersion?: string
  aiSystemId?: string | null
  aiSystemVersionId?: string | null
}) {
  const summary = summarizeRagGenerationEvaluation(input.results)
  const common = {
    projectId: requiredText(input.projectId, 'projectId'),
    evaluationType: 'RAG_GENERATION_GROUNDING',
    capability: 'rag_generation',
    evaluatorType: 'DETERMINISTIC_RAG_GENERATION',
    evaluatorVersion: input.evaluatorVersion ?? '1',
    evidenceRefs: input.evidenceRefs,
    aiSystemId: input.aiSystemId ?? null,
    aiSystemVersionId: input.aiSystemVersionId ?? null,
    dimensions: {
      benchmark_suite_version: requiredText(input.benchmarkSuiteVersion, 'benchmarkSuiteVersion'),
      case_count: summary.caseCount,
      provider_id: requiredText(input.providerId, 'providerId'),
      model_name: requiredText(input.modelName, 'modelName'),
    },
    metadata: {
      case_ids: input.results.map((result) => result.caseId),
      failed_case_ids: input.results.filter((result) => !result.passed).map((result) => result.caseId),
    },
  }

  const metrics = [
    ['CASE_PASS_RATE', summary.passRate],
    ['CITATION_PRECISION', summary.citationPrecision],
    ['CITATION_COMPLETENESS', summary.citationCompleteness],
    ['GROUNDED_CLAIM_RATE', summary.groundedClaimRate],
    ['AUTHORITY_VALIDITY', summary.authorityValidity],
    ['TEMPORAL_VALIDITY', summary.temporalValidity],
    ['REFUSAL_CORRECTNESS', summary.refusalCorrectness],
  ] as const

  const receipts = []
  for (const [metricName, score] of metrics) {
    receipts.push(await input.engine.record({
      ...common,
      metricName,
      score,
      pass: score === 1,
    }))
  }

  return { summary, receipts }
}
