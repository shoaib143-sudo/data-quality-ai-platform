export type LearningCandidateStatus =
  | 'VERIFIED_OUTCOME_CANDIDATE'
  | 'DURABLE_UNVALIDATED_SEMANTIC'
  | 'AUTHORITATIVE_SEMANTIC'

export type LearningAuthorityBlocker =
  | 'SYNTHETIC_BOOTSTRAP'
  | 'UNVERIFIED_OUTCOME'
  | 'MISSING_SOURCE_RUN'
  | 'HUMAN_VALIDATION_REQUIRED'
  | 'AUTHORITY_PROOF_NOT_RECORDED'

export type VerifiedOutcomeLearningRow = {
  id: string
  project_id: string
  source_agent_run_id: string | null
  case_key: string
  source_kind: string
  problem_type: string
  decision_status: string | null
  outcome_status: string | null
  effectiveness: number | string | null
  confidence: number | string | null
  evidence: Record<string, unknown>
  status: string
  occurred_at: string | null
}

export type SemanticLearningRow = {
  id: string
  project_id: string
  source_agent_run_id: string | null
  memory_key: string
  memory_type: string
  content: Record<string, unknown>
  confidence: number | string | null
  status: string
  promoted_at: string
  expires_at: string | null
}

export type LearningEvidenceRef = {
  source: 'agent.agent_learning_cases' | 'agent.agent_memories'
  recordId: string
}

export type LearningAssessmentItem = {
  id: string
  projectId: string
  status: LearningCandidateStatus
  sourceKind: string
  problemType: string | null
  effectiveness: number | null
  confidence: number | null
  sourceAgentRunId: string | null
  evidence: LearningEvidenceRef
  humanValidated: boolean
  authoritative: boolean
  blockers: LearningAuthorityBlocker[]
  occurredAt: string | null
}

export type LearningAssessment = {
  projectId: string
  verifiedOutcomeCandidates: LearningAssessmentItem[]
  semanticMemories: LearningAssessmentItem[]
  authoritativeSemanticCount: number
  semanticPromotionEnabled: false
  proceduralPromotionEnabled: false
  offlineAdaptationEnabled: false
}

export type LearningAssessmentRequest = {
  projectId: string
  limit?: number
}

export interface LearningEngine {
  readonly id: string
  assess(request: LearningAssessmentRequest): Promise<LearningAssessment>
}

export type LearningPersistence = {
  listLearningCases(input: { projectId: string; limit: number }): Promise<VerifiedOutcomeLearningRow[]>
  listSemanticMemories(input: { projectId: string; limit: number; now: string }): Promise<SemanticLearningRow[]>
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

function numeric(value: number | string | null) {
  if (value == null) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : null
}

function hasSyntheticBootstrap(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSyntheticBootstrap)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) =>
    (key.toLowerCase() === 'synthetic_bootstrap' && nested === true) || hasSyntheticBootstrap(nested),
  )
}

function booleanField(value: unknown, key: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return (value as Record<string, unknown>)[key] === true
}

function assessLearningCase(row: VerifiedOutcomeLearningRow): LearningAssessmentItem | null {
  if (row.status !== 'ACTIVE') return null
  const blockers: LearningAuthorityBlocker[] = []
  if (hasSyntheticBootstrap(row.evidence)) blockers.push('SYNTHETIC_BOOTSTRAP')
  if (row.decision_status !== 'VERIFIED' || row.outcome_status !== 'VERIFIED') blockers.push('UNVERIFIED_OUTCOME')
  if (!row.source_agent_run_id) blockers.push('MISSING_SOURCE_RUN')
  if (blockers.length > 0) return null

  return {
    id: row.id,
    projectId: row.project_id,
    status: 'VERIFIED_OUTCOME_CANDIDATE',
    sourceKind: row.source_kind,
    problemType: row.problem_type,
    effectiveness: numeric(row.effectiveness),
    confidence: numeric(row.confidence),
    sourceAgentRunId: row.source_agent_run_id,
    evidence: { source: 'agent.agent_learning_cases', recordId: row.id },
    humanValidated: false,
    authoritative: false,
    blockers: ['AUTHORITY_PROOF_NOT_RECORDED'],
    occurredAt: row.occurred_at,
  }
}

function assessSemanticMemory(row: SemanticLearningRow): LearningAssessmentItem | null {
  if (row.status !== 'ACTIVE' || row.memory_type !== 'SEMANTIC') return null
  const humanValidated = booleanField(row.content, 'human_validated')
  const blockers: LearningAuthorityBlocker[] = []
  if (!row.source_agent_run_id) blockers.push('MISSING_SOURCE_RUN')
  if (!humanValidated) blockers.push('HUMAN_VALIDATION_REQUIRED')
  blockers.push('AUTHORITY_PROOF_NOT_RECORDED')

  return {
    id: row.id,
    projectId: row.project_id,
    status: humanValidated ? 'AUTHORITATIVE_SEMANTIC' : 'DURABLE_UNVALIDATED_SEMANTIC',
    sourceKind: 'AGENT_SEMANTIC_MEMORY',
    problemType: null,
    effectiveness: null,
    confidence: numeric(row.confidence),
    sourceAgentRunId: row.source_agent_run_id,
    evidence: { source: 'agent.agent_memories', recordId: row.id },
    humanValidated,
    authoritative: false,
    blockers,
    occurredAt: row.promoted_at,
  }
}

export class GovernedLearningEngine implements LearningEngine {
  readonly id = 'postgres_governed_learning_engine'
  private readonly persistence: LearningPersistence

  constructor(persistence: LearningPersistence) {
    this.persistence = persistence
  }

  async assess(request: LearningAssessmentRequest): Promise<LearningAssessment> {
    const projectId = requiredText(request.projectId, 'projectId')
    const limit = boundedLimit(request.limit)
    const now = new Date().toISOString()
    const [caseRows, semanticRows] = await Promise.all([
      this.persistence.listLearningCases({ projectId, limit }),
      this.persistence.listSemanticMemories({ projectId, limit, now }),
    ])

    const verifiedOutcomeCandidates = caseRows
      .filter((row) => row.project_id === projectId)
      .map(assessLearningCase)
      .filter((item): item is LearningAssessmentItem => item !== null)
      .sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''))

    const semanticMemories = semanticRows
      .filter((row) => row.project_id === projectId)
      .map(assessSemanticMemory)
      .filter((item): item is LearningAssessmentItem => item !== null)
      .sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''))

    return {
      projectId,
      verifiedOutcomeCandidates,
      semanticMemories,
      authoritativeSemanticCount: semanticMemories.filter((item) => item.authoritative).length,
      semanticPromotionEnabled: false,
      proceduralPromotionEnabled: false,
      offlineAdaptationEnabled: false,
    }
  }
}
