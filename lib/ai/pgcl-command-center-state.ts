import { authorizeProject } from '@/lib/auth/authorize'
import { GOVERNED_AGENT_KEYS } from '@/lib/agents/governed-agent-registry'
import { createAdminClient } from '@/lib/supabase/admin'

export type PgclCommandCenterCandidate = {
  candidateId: string
  agentKey: string
  skillKey: string
  title: string
  canonicalStatus: string
  runMode: string
  useCaseKey: string
  resultSummary: string
  reviewStatus: string
  productionEligible: boolean
  learningProvenanceRecordedAt: string | null
  latestDecision: string | null
  reviewedAt: string | null
  significanceSignals: string[]
  occurrenceCount: number
  promotedLearningCaseId: string | null
  promotedLearningCaseStatus: string | null
  usageCount: number
  retrievedCount: number
  appliedCount: number
  succeededCount: number
  failedCount: number
  dismissedCount: number
  profilingApplicationCount: number
  dataQualityApplicationCount: number
  supervisorApplicationCount: number
  directSpecialistApplicationCount: number
  authoritativeOutcomeCount: number
  unknownApplicationSurfaceCount: number
  executionSurfaces: string[]
  averageRelevance: number | null
  lastUsedAt: string | null
  createdAt: string
  updatedAt: string
}

export type PgclAgentCoverage = {
  agentKey: string
  candidateCount: number
  approvedCount: number
  productionEligibleCount: number
  promotedActiveCount: number
  usageCount: number
  appliedCount: number
  succeededCount: number
  failedCount: number
  profilingApplicationCount: number
  dataQualityApplicationCount: number
  supervisorApplicationCount: number
  directSpecialistApplicationCount: number
  authoritativeOutcomeCount: number
}

export type PgclCommandCenterState = {
  candidates: PgclCommandCenterCandidate[]
  agentCoverage: PgclAgentCoverage[]
  counts: {
    total: number
    agentsRepresented: number
    pendingReview: number
    approved: number
    productionEligible: number
    nonProductionOrUnclassified: number
    rejected: number
    deferred: number
    oneOff: number
    retired: number
    promotedActive: number
    occurrenceEvents: number
    usageEvents: number
    applied: number
    succeeded: number
    failed: number
    dismissed: number
    profilingApplications: number
    dataQualityApplications: number
    supervisorApplications: number
    directSpecialistApplications: number
    authoritativeOutcomes: number
    unknownApplicationSurfaces: number
  }
  schemaCompatibility: {
    productionProvenanceColumnsAvailable: boolean
  }
  authority: {
    contextOnly: true
    mayAuthorizeAction: false
    automaticPromotionAllowed: false
    adminReviewRequired: true
    currentPolicyReevaluationRequired: true
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => String(item).trim()).filter(Boolean)
    : []
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

type PositiveCaseProjectionRow = {
  candidate_id: unknown
  run_mode: unknown
  use_case_key: unknown
  result_summary: unknown
  significance_signals: unknown
  review_status: unknown
  production_eligible?: unknown
  learning_provenance_recorded_at?: unknown
  reviewed_at: unknown
  created_at: unknown
  updated_at: unknown
}

async function loadPositiveCaseProjection(
  supabase: ReturnType<typeof createAdminClient>,
  projectId: string,
) {
  const current = await supabase.schema('agent').from('positive_learning_cases')
    .select('candidate_id,run_mode,use_case_key,result_summary,significance_signals,review_status,production_eligible,learning_provenance_recorded_at,reviewed_at,created_at,updated_at')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (!current.error) {
    return {
      rows: (current.data ?? []) as PositiveCaseProjectionRow[],
      productionProvenanceColumnsAvailable: true,
    }
  }

  const missingProductionProvenanceColumns =
    current.error.message.includes('production_eligible')
    || current.error.message.includes('learning_provenance_recorded_at')

  if (!missingProductionProvenanceColumns) {
    throw new Error(`Unable to load PGCL positive cases: ${current.error.message}`)
  }

  const legacy = await supabase.schema('agent').from('positive_learning_cases')
    .select('candidate_id,run_mode,use_case_key,result_summary,significance_signals,review_status,reviewed_at,created_at,updated_at')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false })
    .limit(100)

  if (legacy.error) throw new Error(`Unable to load PGCL positive cases: ${legacy.error.message}`)

  return {
    rows: (legacy.data ?? []) as PositiveCaseProjectionRow[],
    productionProvenanceColumnsAvailable: false,
  }
}

export async function readPgclCommandCenterState(projectId: string, actorUserId: string): Promise<PgclCommandCenterState> {
  await authorizeProject(actorUserId, projectId, 'admin.manage')
  const supabase = createAdminClient()

  const [
    candidateResult,
    positiveCaseProjection,
    reviewResult,
    occurrenceResult,
    usageResult,
    learningCaseResult,
  ] = await Promise.all([
    supabase.schema('agent').from('learning_candidates')
      .select('id,agent_key,skill_key,title,status,created_at,updated_at')
      .eq('project_id', projectId)
      .eq('candidate_type', 'POSITIVE_CASE')
      .order('updated_at', { ascending: false })
      .limit(100),
    loadPositiveCaseProjection(supabase, projectId),
    supabase.schema('agent').from('positive_learning_case_reviews')
      .select('candidate_id,decision,created_at')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase.schema('agent').from('positive_learning_case_occurrences')
      .select('candidate_id,observed_at')
      .eq('project_id', projectId)
      .order('observed_at', { ascending: false })
      .limit(1000),
    supabase.schema('agent').from('positive_learning_case_usages')
      .select('candidate_id,learning_case_id,relevance,usage_status,outcome,first_retrieved_at,updated_at')
      .eq('project_id', projectId)
      .order('updated_at', { ascending: false })
      .limit(1000),
    supabase.schema('agent').from('agent_learning_cases')
      .select('id,case_key,status,decision_status,outcome_status,effectiveness,confidence,evidence,updated_at')
      .eq('project_id', projectId)
      .eq('source_kind', 'PGCL_POSITIVE_CASE')
      .order('updated_at', { ascending: false })
      .limit(100),
  ])

  if (candidateResult.error) throw new Error(`Unable to load PGCL canonical candidates: ${candidateResult.error.message}`)
  if (reviewResult.error) throw new Error(`Unable to load PGCL reviews: ${reviewResult.error.message}`)
  if (occurrenceResult.error) throw new Error(`Unable to load PGCL occurrences: ${occurrenceResult.error.message}`)
  if (usageResult.error) throw new Error(`Unable to load PGCL usage evidence: ${usageResult.error.message}`)
  if (learningCaseResult.error) throw new Error(`Unable to load promoted PGCL learning cases: ${learningCaseResult.error.message}`)

  const positiveCaseByCandidate = new Map(
    positiveCaseProjection.rows.map((row) => [String(row.candidate_id), row]),
  )

  const latestReviewByCandidate = new Map<string, (typeof reviewResult.data)[number]>()
  for (const row of reviewResult.data ?? []) {
    const candidateId = String(row.candidate_id)
    if (!latestReviewByCandidate.has(candidateId)) latestReviewByCandidate.set(candidateId, row)
  }

  const occurrenceCountByCandidate = new Map<string, number>()
  for (const row of occurrenceResult.data ?? []) {
    const candidateId = String(row.candidate_id)
    occurrenceCountByCandidate.set(candidateId, (occurrenceCountByCandidate.get(candidateId) ?? 0) + 1)
  }

  type UsageStats = {
    usageCount: number
    retrievedCount: number
    appliedCount: number
    succeededCount: number
    failedCount: number
    dismissedCount: number
    profilingApplicationCount: number
    dataQualityApplicationCount: number
    supervisorApplicationCount: number
    directSpecialistApplicationCount: number
    authoritativeOutcomeCount: number
    unknownApplicationSurfaceCount: number
    executionSurfaces: Set<string>
    relevanceTotal: number
    relevanceCount: number
    lastUsedAt: string | null
  }
  const usageByCandidate = new Map<string, UsageStats>()
  for (const row of usageResult.data ?? []) {
    const candidateId = String(row.candidate_id)
    const current = usageByCandidate.get(candidateId) ?? {
      usageCount: 0,
      retrievedCount: 0,
      appliedCount: 0,
      succeededCount: 0,
      failedCount: 0,
      dismissedCount: 0,
      profilingApplicationCount: 0,
      dataQualityApplicationCount: 0,
      supervisorApplicationCount: 0,
      directSpecialistApplicationCount: 0,
      authoritativeOutcomeCount: 0,
      unknownApplicationSurfaceCount: 0,
      executionSurfaces: new Set<string>(),
      relevanceTotal: 0,
      relevanceCount: 0,
      lastUsedAt: null,
    }
    current.usageCount += 1
    const status = String(row.usage_status)
    if (status === 'RETRIEVED') current.retrievedCount += 1
    if (status === 'APPLIED') current.appliedCount += 1
    if (status === 'SUCCEEDED') current.succeededCount += 1
    if (status === 'FAILED') current.failedCount += 1
    if (status === 'DISMISSED') current.dismissedCount += 1

    const outcome = record(row.outcome)
    const explicitSurface = String(outcome.execution_surface ?? '').trim()
    const inferredSurface = explicitSurface
      || (outcome.attribution === 'EXPLICIT_AGENT_OUTPUT' ? 'DIRECT_SPECIALIST' : '')
    if (inferredSurface) current.executionSurfaces.add(inferredSurface)

    const wasApplied = ['APPLIED', 'SUCCEEDED', 'FAILED', 'DISMISSED'].includes(status)
    if (wasApplied) {
      if (inferredSurface === 'PROFILING_INVESTIGATION') current.profilingApplicationCount += 1
      else if (inferredSurface === 'DATA_QUALITY_INVESTIGATION') current.dataQualityApplicationCount += 1
      else if (inferredSurface === 'SUPERVISOR_SPECIALIST') current.supervisorApplicationCount += 1
      else if (inferredSurface === 'DIRECT_SPECIALIST') current.directSpecialistApplicationCount += 1
      else current.unknownApplicationSurfaceCount += 1
    }

    if (
      outcome.terminal_attribution === 'AUTHORITATIVE_GOVERNED_OUTCOME'
      || outcome.attribution === 'AUTHORITATIVE_GOVERNED_OUTCOME'
    ) {
      current.authoritativeOutcomeCount += 1
    }

    if (row.relevance != null && Number.isFinite(Number(row.relevance))) {
      current.relevanceTotal += Number(row.relevance)
      current.relevanceCount += 1
    }
    const updatedAt = String(row.updated_at || row.first_retrieved_at)
    if (!current.lastUsedAt || updatedAt > current.lastUsedAt) current.lastUsedAt = updatedAt
    usageByCandidate.set(candidateId, current)
  }

  const learningCaseByCandidate = new Map<string, (typeof learningCaseResult.data)[number]>()
  for (const row of learningCaseResult.data ?? []) {
    const evidence = record(row.evidence)
    const candidateId = String(evidence.pgcl_candidate_id ?? '').trim()
      || String(row.case_key ?? '').replace(/^pgcl:/, '').trim()
    if (candidateId && !learningCaseByCandidate.has(candidateId)) {
      learningCaseByCandidate.set(candidateId, row)
    }
  }

  const candidates: PgclCommandCenterCandidate[] = []
  for (const candidate of candidateResult.data ?? []) {
    const candidateId = String(candidate.id)
    const positiveCase = positiveCaseByCandidate.get(candidateId)
    if (!positiveCase) continue
    const latestReview = latestReviewByCandidate.get(candidateId)
    const learningCase = learningCaseByCandidate.get(candidateId)
    const usage = usageByCandidate.get(candidateId)
    candidates.push({
      candidateId,
      agentKey: String(candidate.agent_key),
      skillKey: String(candidate.skill_key),
      title: String(candidate.title),
      canonicalStatus: String(candidate.status),
      runMode: String(positiveCase.run_mode),
      useCaseKey: String(positiveCase.use_case_key),
      resultSummary: String(positiveCase.result_summary),
      reviewStatus: String(positiveCase.review_status),
      productionEligible:
        positiveCaseProjection.productionProvenanceColumnsAvailable
        && positiveCase.production_eligible === true,
      learningProvenanceRecordedAt:
        positiveCaseProjection.productionProvenanceColumnsAvailable
        && positiveCase.learning_provenance_recorded_at
        ? String(positiveCase.learning_provenance_recorded_at)
        : null,
      latestDecision: latestReview ? String(latestReview.decision) : null,
      reviewedAt: positiveCase.reviewed_at ? String(positiveCase.reviewed_at) : null,
      significanceSignals: stringArray(positiveCase.significance_signals),
      occurrenceCount: occurrenceCountByCandidate.get(candidateId) ?? 0,
      promotedLearningCaseId: learningCase ? String(learningCase.id) : null,
      promotedLearningCaseStatus: learningCase ? String(learningCase.status) : null,
      usageCount: usage?.usageCount ?? 0,
      retrievedCount: usage?.retrievedCount ?? 0,
      appliedCount: usage?.appliedCount ?? 0,
      succeededCount: usage?.succeededCount ?? 0,
      failedCount: usage?.failedCount ?? 0,
      dismissedCount: usage?.dismissedCount ?? 0,
      profilingApplicationCount: usage?.profilingApplicationCount ?? 0,
      dataQualityApplicationCount: usage?.dataQualityApplicationCount ?? 0,
      supervisorApplicationCount: usage?.supervisorApplicationCount ?? 0,
      directSpecialistApplicationCount: usage?.directSpecialistApplicationCount ?? 0,
      authoritativeOutcomeCount: usage?.authoritativeOutcomeCount ?? 0,
      unknownApplicationSurfaceCount: usage?.unknownApplicationSurfaceCount ?? 0,
      executionSurfaces: usage ? [...usage.executionSurfaces].sort() : [],
      averageRelevance: usage?.relevanceCount
        ? usage.relevanceTotal / usage.relevanceCount
        : null,
      lastUsedAt: usage?.lastUsedAt ?? null,
      createdAt: String(positiveCase.created_at ?? candidate.created_at),
      updatedAt: String(positiveCase.updated_at ?? candidate.updated_at),
    })
  }

  const agentCoverage: PgclAgentCoverage[] = GOVERNED_AGENT_KEYS.map((agentKey) => {
    const agentCandidates = candidates.filter((candidate) => candidate.agentKey === agentKey)
    return {
      agentKey,
      candidateCount: agentCandidates.length,
      approvedCount: agentCandidates.filter((candidate) => candidate.reviewStatus === 'APPROVED').length,
      productionEligibleCount: agentCandidates.filter((candidate) => candidate.productionEligible).length,
      promotedActiveCount: agentCandidates.filter((candidate) => candidate.promotedLearningCaseStatus === 'ACTIVE').length,
      usageCount: agentCandidates.reduce((sum, candidate) => sum + candidate.usageCount, 0),
      appliedCount: agentCandidates.reduce((sum, candidate) => sum + candidate.appliedCount, 0),
      succeededCount: agentCandidates.reduce((sum, candidate) => sum + candidate.succeededCount, 0),
      failedCount: agentCandidates.reduce((sum, candidate) => sum + candidate.failedCount, 0),
      profilingApplicationCount: agentCandidates.reduce((sum, candidate) => sum + candidate.profilingApplicationCount, 0),
      dataQualityApplicationCount: agentCandidates.reduce((sum, candidate) => sum + candidate.dataQualityApplicationCount, 0),
      supervisorApplicationCount: agentCandidates.reduce((sum, candidate) => sum + candidate.supervisorApplicationCount, 0),
      directSpecialistApplicationCount: agentCandidates.reduce((sum, candidate) => sum + candidate.directSpecialistApplicationCount, 0),
      authoritativeOutcomeCount: agentCandidates.reduce((sum, candidate) => sum + candidate.authoritativeOutcomeCount, 0),
    }
  })

  return {
    candidates,
    agentCoverage,
    counts: {
      total: candidates.length,
      agentsRepresented: new Set(candidates.map((candidate) => candidate.agentKey)).size,
      pendingReview: candidates.filter((candidate) => candidate.reviewStatus === 'PENDING_REVIEW').length,
      approved: candidates.filter((candidate) => candidate.reviewStatus === 'APPROVED').length,
      productionEligible: candidates.filter((candidate) => candidate.productionEligible).length,
      nonProductionOrUnclassified: candidates.filter((candidate) => !candidate.productionEligible).length,
      rejected: candidates.filter((candidate) => candidate.reviewStatus === 'REJECTED').length,
      deferred: candidates.filter((candidate) => candidate.reviewStatus === 'DEFERRED').length,
      oneOff: candidates.filter((candidate) => candidate.reviewStatus === 'ONE_OFF').length,
      retired: candidates.filter((candidate) => candidate.reviewStatus === 'RETIRED').length,
      promotedActive: candidates.filter((candidate) => candidate.promotedLearningCaseStatus === 'ACTIVE').length,
      occurrenceEvents: candidates.reduce((sum, candidate) => sum + candidate.occurrenceCount, 0),
      usageEvents: candidates.reduce((sum, candidate) => sum + candidate.usageCount, 0),
      applied: candidates.reduce((sum, candidate) => sum + candidate.appliedCount, 0),
      succeeded: candidates.reduce((sum, candidate) => sum + candidate.succeededCount, 0),
      failed: candidates.reduce((sum, candidate) => sum + candidate.failedCount, 0),
      dismissed: candidates.reduce((sum, candidate) => sum + candidate.dismissedCount, 0),
      profilingApplications: candidates.reduce((sum, candidate) => sum + candidate.profilingApplicationCount, 0),
      dataQualityApplications: candidates.reduce((sum, candidate) => sum + candidate.dataQualityApplicationCount, 0),
      supervisorApplications: candidates.reduce((sum, candidate) => sum + candidate.supervisorApplicationCount, 0),
      directSpecialistApplications: candidates.reduce((sum, candidate) => sum + candidate.directSpecialistApplicationCount, 0),
      authoritativeOutcomes: candidates.reduce((sum, candidate) => sum + candidate.authoritativeOutcomeCount, 0),
      unknownApplicationSurfaces: candidates.reduce((sum, candidate) => sum + candidate.unknownApplicationSurfaceCount, 0),
    },
    schemaCompatibility: {
      productionProvenanceColumnsAvailable: positiveCaseProjection.productionProvenanceColumnsAvailable,
    },
    authority: {
      contextOnly: true,
      mayAuthorizeAction: false,
      automaticPromotionAllowed: false,
      adminReviewRequired: true,
      currentPolicyReevaluationRequired: true,
    },
  }
}
