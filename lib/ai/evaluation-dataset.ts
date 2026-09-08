export type EvaluationDatasetJson = Record<string, unknown>

export type LearningCaseRecord = {
  id: string
  project_id: string
  source_agent_run_id: string | null
  case_key: string
  source_kind: string
  problem_type: string
  context: EvaluationDatasetJson
  decision_status: string | null
  outcome_status: string | null
  effectiveness: number | string | null
  confidence: number | string | null
  evidence: EvaluationDatasetJson
  status: string
  occurred_at: string | null
}

export type VerifiedDataQualityLearningRecord = {
  id: string
  project_id: string
  workflow_instance_id: string
  remediation_outcome_id: string
  source_agent_run_id: string
  verification_agent_run_id: string | null
  status: string
  effective: boolean | null
  evidence: EvaluationDatasetJson
  outcome: {
    id: string
    status: string
    verified_at: string | null
    verification_job_id: string | null
    verification_agent_run_id: string | null
    checks: EvaluationDatasetJson
  } | null
}

export type VerifiedEvaluationEvidence = {
  learningCaseId: string
  recommendationLearningId: string
  remediationOutcomeId: string
  workflowInstanceId: string
  sourceAgentRunId: string
  verificationAgentRunId: string | null
  verificationJobId: string | null
}

export type VerifiedEvaluationCase = {
  caseId: string
  projectId: string
  sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING'
  problemType: string
  context: EvaluationDatasetJson
  verifiedOutcome: {
    effectiveness: number
    confidence: number
    checks: EvaluationDatasetJson
    verifiedAt: string
  }
  evidence: VerifiedEvaluationEvidence
  evidenceRefs: string[]
  occurredAt: string | null
}

export type EvaluationDatasetRequest = {
  projectId: string
  limit?: number
}

export type VerifiedEvaluationDataset = {
  datasetKind: 'verified_production_cases'
  projectId: string
  cases: VerifiedEvaluationCase[]
}

export type EvaluationDatasetSource = {
  listLearningCases(projectId: string, limit: number): Promise<LearningCaseRecord[]>
  listDataQualityLearning(projectId: string, ids: string[]): Promise<VerifiedDataQualityLearningRecord[]>
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function boundedLimit(value: number | undefined) {
  if (value == null) return 100
  if (!Number.isInteger(value) || value < 1) throw new Error('limit must be a positive integer')
  return Math.min(value, 500)
}

function numberInUnitInterval(value: number | string | null, label: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 1) return null
  if (label === 'effectiveness' && parsed <= 0) return null
  return parsed
}

function hasSyntheticBootstrap(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSyntheticBootstrap)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) =>
    (key.toLowerCase() === 'synthetic_bootstrap' && nested === true) || hasSyntheticBootstrap(nested),
  )
}

function allChecksPassed(checks: EvaluationDatasetJson) {
  const entries = Object.values(checks)
  if (entries.length === 0) return false
  return entries.every((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    return (value as Record<string, unknown>).passed === true
  })
}

function sourceId(caseRecord: LearningCaseRecord) {
  const value = caseRecord.evidence?.source_id
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function projectCase(
  learningCase: LearningCaseRecord,
  learning: VerifiedDataQualityLearningRecord,
): VerifiedEvaluationCase | null {
  if (learningCase.source_kind !== 'DATA_QUALITY_RECOMMENDATION_LEARNING') return null
  if (learningCase.status !== 'ACTIVE') return null
  if (learningCase.decision_status !== 'VERIFIED' || learningCase.outcome_status !== 'VERIFIED') return null
  if (!learningCase.source_agent_run_id || hasSyntheticBootstrap(learningCase.evidence)) return null

  const effectiveness = numberInUnitInterval(learningCase.effectiveness, 'effectiveness')
  const confidence = numberInUnitInterval(learningCase.confidence, 'confidence')
  if (effectiveness == null || confidence == null) return null

  if (learning.project_id !== learningCase.project_id || learning.status !== 'VERIFIED' || learning.effective !== true) return null
  if (learning.source_agent_run_id !== learningCase.source_agent_run_id) return null
  if (!learning.outcome || learning.outcome.status !== 'VERIFIED' || !learning.outcome.verified_at) return null
  if (learning.outcome.id !== learning.remediation_outcome_id) return null
  if (!allChecksPassed(learning.outcome.checks)) return null

  const verificationAgentRunId = learning.verification_agent_run_id ?? learning.outcome.verification_agent_run_id
  if (!verificationAgentRunId && !learning.outcome.verification_job_id) return null

  const refs = [
    `agent.agent_learning_cases:${learningCase.id}`,
    `governance.data_quality_recommendation_learning:${learning.id}`,
    `governance.data_quality_remediation_outcomes:${learning.remediation_outcome_id}`,
    `agent.agent_runs:${learning.source_agent_run_id}`,
    ...(verificationAgentRunId ? [`agent.agent_runs:${verificationAgentRunId}`] : []),
  ]

  return {
    caseId: learningCase.id,
    projectId: learningCase.project_id,
    sourceKind: 'DATA_QUALITY_RECOMMENDATION_LEARNING',
    problemType: learningCase.problem_type,
    context: learningCase.context,
    verifiedOutcome: {
      effectiveness,
      confidence,
      checks: learning.outcome.checks,
      verifiedAt: new Date(learning.outcome.verified_at).toISOString(),
    },
    evidence: {
      learningCaseId: learningCase.id,
      recommendationLearningId: learning.id,
      remediationOutcomeId: learning.remediation_outcome_id,
      workflowInstanceId: learning.workflow_instance_id,
      sourceAgentRunId: learning.source_agent_run_id,
      verificationAgentRunId,
      verificationJobId: learning.outcome.verification_job_id,
    },
    evidenceRefs: refs,
    occurredAt: learningCase.occurred_at,
  }
}

export class VerifiedEvaluationDatasetBuilder {
  private readonly source: EvaluationDatasetSource

  constructor(source: EvaluationDatasetSource) {
    this.source = source
  }

  async build(request: EvaluationDatasetRequest): Promise<VerifiedEvaluationDataset> {
    const projectId = requiredText(request.projectId, 'projectId')
    const limit = boundedLimit(request.limit)
    const candidates = await this.source.listLearningCases(projectId, limit)

    const candidateByLearningId = new Map<string, LearningCaseRecord>()
    for (const candidate of candidates) {
      if (candidate.project_id !== projectId || hasSyntheticBootstrap(candidate.evidence)) continue
      const id = sourceId(candidate)
      if (id) candidateByLearningId.set(id, candidate)
    }

    const learningRows = candidateByLearningId.size > 0
      ? await this.source.listDataQualityLearning(projectId, [...candidateByLearningId.keys()])
      : []

    const cases = learningRows
      .map((learning) => {
        const candidate = candidateByLearningId.get(learning.id)
        return candidate ? projectCase(candidate, learning) : null
      })
      .filter((value): value is VerifiedEvaluationCase => value !== null)
      .sort((a, b) => b.verifiedOutcome.verifiedAt.localeCompare(a.verifiedOutcome.verifiedAt))

    return { datasetKind: 'verified_production_cases', projectId, cases }
  }
}
