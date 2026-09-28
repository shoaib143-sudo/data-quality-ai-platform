import { createAdminClient } from '@/lib/supabase/admin'
import { AuthorizationError } from '@/lib/auth/authorize'
import { resolveInstanceOrganizationMembership } from './instance-organization'
import {
  GOVERNANCE_MATURITY_FRAMEWORK_VERSION,
  GOVERNANCE_MATURITY_QUESTIONS,
  questionsForProfile,
  type AssessmentPriority,
  type OrganizationAssessmentProfile,
} from './maturity-framework'
import { scoreGovernanceMaturity, type AssessmentAnswer } from './maturity-scoring'

type StoredAssessment = {
  id: string
  organization_id: string
  framework_version: string
  status: string
  organization_profile: OrganizationAssessmentProfile | null
  scorecard: Record<string, unknown> | null
  created_at: string
  updated_at: string
  completed_at: string | null
}

type StoredResponse = {
  id: string
  assessment_id: string
  question_id: string
  respondent_user_id: string
  maturity: number
  target: number | null
  priority: AssessmentPriority
  evidence_confidence: number | null
  coverage: number | null
  comment: string | null
  updated_at: string
}

function isAdministrator(role: string | null) {
  return role === 'OWNER' || role === 'ADMIN'
}

function validLevel(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= 5
}

function validPercent(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
}

function normalizeProfile(value: unknown): OrganizationAssessmentProfile {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const profile: OrganizationAssessmentProfile = {}
  const textKeys = ['industry', 'country', 'employeeBand'] as const
  const booleanKeys = ['regulated', 'processesPersonalData', 'processesSensitiveData', 'usesAi', 'sharesDataExternally', 'crossBorderTransfers'] as const
  for (const key of textKeys) if (typeof source[key] === 'string') profile[key] = String(source[key]).trim()
  for (const key of booleanKeys) if (typeof source[key] === 'boolean') profile[key] = source[key]
  if (['PRIVATE','PUBLIC','NONPROFIT','OTHER'].includes(String(source.organizationType))) {
    profile.organizationType = String(source.organizationType) as OrganizationAssessmentProfile['organizationType']
  }
  for (const key of ['cloudPlatforms', 'dataPlatforms'] as const) {
    if (Array.isArray(source[key])) profile[key] = source[key].filter(item => typeof item === 'string').map(item => String(item).trim()).filter(Boolean)
  }
  return profile
}

const evidenceConfidenceByState: Record<string, number> = {
  SELF_DECLARED: 20,
  CORROBORATED: 40,
  EVIDENCE_SUPPORTED: 70,
  SYSTEM_OBSERVED: 85,
  CONTINUOUSLY_VERIFIED: 100,
  CONFLICTING: 10,
  EXPIRED: 0,
}

function responseAsAnswer(
  row: StoredResponse,
  evidenceConfidence?: number | null,
  observedCoverage?: number | null,
): AssessmentAnswer {
  return {
    questionId: row.question_id,
    respondentId: row.respondent_user_id,
    maturity: Number(row.maturity),
    target: row.target === null ? null : Number(row.target),
    priority: row.priority,
    evidenceConfidence: evidenceConfidence ?? (row.evidence_confidence === null ? null : Number(row.evidence_confidence)),
    coverage: observedCoverage ?? (row.coverage === null ? null : Number(row.coverage)),
    comment: row.comment,
  }
}

function activeAt(expiresAt: unknown) {
  return !expiresAt || new Date(String(expiresAt)).getTime() > Date.now()
}

function enrichAssessmentAnswers(
  responses: StoredResponse[],
  evidence: Array<{ question_id: string; verification_state: string; expires_at: string | null }>,
  observations: Array<{ question_id: string; confidence: number | null; coverage: number | null; observed_at: string; expires_at: string | null }>,
) {
  const evidenceByQuestion = new Map<string, number>()
  for (const item of evidence) {
    if (!activeAt(item.expires_at)) continue
    const confidence = evidenceConfidenceByState[String(item.verification_state)] ?? 0
    evidenceByQuestion.set(item.question_id, Math.max(evidenceByQuestion.get(item.question_id) ?? 0, confidence))
  }

  const observationByQuestion = new Map<string, { confidence: number | null; coverage: number | null; observed_at: string }>()
  for (const item of observations) {
    if (!activeAt(item.expires_at)) continue
    const current = observationByQuestion.get(item.question_id)
    if (!current || new Date(item.observed_at).getTime() > new Date(current.observed_at).getTime()) {
      observationByQuestion.set(item.question_id, item)
    }
  }

  return responses.map(row => {
    const observation = observationByQuestion.get(row.question_id)
    const evidenceConfidence = Math.max(
      row.evidence_confidence === null ? 0 : Number(row.evidence_confidence),
      evidenceByQuestion.get(row.question_id) ?? 0,
      observation?.confidence === null || observation?.confidence === undefined ? 0 : Number(observation.confidence),
    )
    return responseAsAnswer(
      row,
      evidenceConfidence > 0 ? evidenceConfidence : null,
      observation?.coverage === null || observation?.coverage === undefined ? null : Number(observation.coverage),
    )
  })
}

async function loadAssessmentRows(assessmentId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('maturity_assessment_responses')
    .select('id,assessment_id,question_id,respondent_user_id,maturity,target,priority,evidence_confidence,coverage,comment,updated_at')
    .eq('assessment_id', assessmentId)
  if (error) throw new Error(`Unable to load maturity responses: ${error.message}`)
  return (data ?? []) as StoredResponse[]
}

async function refreshScorecard(assessment: StoredAssessment) {
  const admin = createAdminClient()
  const [rows, evidenceResult, observationsResult] = await Promise.all([
    loadAssessmentRows(assessment.id),
    admin.schema('governance').from('maturity_assessment_evidence')
      .select('question_id,verification_state,expires_at').eq('assessment_id', assessment.id),
    admin.schema('governance').from('maturity_assessment_observations')
      .select('question_id,confidence,coverage,observed_at,expires_at').eq('assessment_id', assessment.id).order('observed_at', { ascending: false }),
  ])
  if (evidenceResult.error) throw new Error(`Unable to load maturity evidence: ${evidenceResult.error.message}`)
  if (observationsResult.error) throw new Error(`Unable to load maturity observations: ${observationsResult.error.message}`)
  const profile = normalizeProfile(assessment.organization_profile)
  const enrichedAnswers = enrichAssessmentAnswers(
    rows,
    (evidenceResult.data ?? []) as Array<{ question_id: string; verification_state: string; expires_at: string | null }>,
    (observationsResult.data ?? []) as Array<{ question_id: string; confidence: number | null; coverage: number | null; observed_at: string; expires_at: string | null }>,
  )
  const scorecard = scoreGovernanceMaturity(profile, enrichedAnswers)
  const status = scorecard.completion >= 100 ? 'COMPLETE' : scorecard.completion > 0 ? 'BASELINE' : 'DRAFT'
  const { error } = await admin.schema('governance').from('maturity_assessments').update({
    scorecard,
    status,
    updated_at: new Date().toISOString(),
    completed_at: status === 'COMPLETE' ? new Date().toISOString() : null,
  }).eq('id', assessment.id)
  if (error) throw new Error(`Unable to persist maturity scorecard: ${error.message}`)
  return { rows, scorecard, status }
}

export async function loadLatestMaturityAssessment(userId: string) {
  const membership = await resolveInstanceOrganizationMembership(userId)
  const admin = createAdminClient()
  const historyResult = await admin.schema('governance').from('maturity_assessments')
    .select('id,status,framework_version,scorecard,created_at,completed_at')
    .eq('organization_id', membership.organizationId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (historyResult.error) throw new Error(`Unable to load maturity assessment history: ${historyResult.error.message}`)
  const history = historyResult.data ?? []
  const { data, error } = await admin.schema('governance').from('maturity_assessments')
    .select('id,organization_id,framework_version,status,organization_profile,scorecard,created_at,updated_at,completed_at')
    .eq('organization_id', membership.organizationId)
    .eq('framework_version', GOVERNANCE_MATURITY_FRAMEWORK_VERSION)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Unable to load maturity assessment: ${error.message}`)

  const assessment = data as StoredAssessment | null
  const profile = normalizeProfile(assessment?.organization_profile)
  const questions = questionsForProfile(profile)
  if (!assessment) {
    return {
      organizationId: membership.organizationId,
      organizationRole: membership.organizationRole,
      canManageProfile: isAdministrator(membership.organizationRole),
      assessment: null,
      profile,
      questions,
      currentUserResponses: [] as StoredResponse[],
      allResponses: [] as StoredResponse[],
      scorecard: scoreGovernanceMaturity(profile, []),
      evidenceCount: 0,
      observationCount: 0,
      history,
    }
  }

  const [responses, evidenceResult, observationResult] = await Promise.all([
    loadAssessmentRows(assessment.id),
    admin.schema('governance').from('maturity_assessment_evidence')
      .select('question_id,verification_state,expires_at').eq('assessment_id', assessment.id),
    admin.schema('governance').from('maturity_assessment_observations')
      .select('question_id,confidence,coverage,observed_at,expires_at').eq('assessment_id', assessment.id).order('observed_at', { ascending: false }),
  ])
  if (evidenceResult.error) throw new Error(`Unable to load maturity evidence: ${evidenceResult.error.message}`)
  if (observationResult.error) throw new Error(`Unable to load maturity observations: ${observationResult.error.message}`)
  const evidenceRows = (evidenceResult.data ?? []) as Array<{ question_id: string; verification_state: string; expires_at: string | null }>
  const observationRows = (observationResult.data ?? []) as Array<{ question_id: string; confidence: number | null; coverage: number | null; observed_at: string; expires_at: string | null }>
  const scorecard = scoreGovernanceMaturity(profile, enrichAssessmentAnswers(responses, evidenceRows, observationRows))
  return {
    organizationId: membership.organizationId,
    organizationRole: membership.organizationRole,
    canManageProfile: isAdministrator(membership.organizationRole),
    assessment,
    profile,
    questions,
    currentUserResponses: responses.filter(row => row.respondent_user_id === userId),
    allResponses: responses,
    scorecard,
    evidenceCount: evidenceRows.length,
    observationCount: observationRows.length,
    history,
  }
}

export async function createOrUpdateMaturityAssessment(
  userId: string,
  input: { profile?: unknown; status?: string; startNew?: boolean },
) {
  const membership = await resolveInstanceOrganizationMembership(userId)
  if (!isAdministrator(membership.organizationRole)) throw new AuthorizationError('Organization administrator access is required to configure the maturity assessment.')
  const admin = createAdminClient()
  const current = await loadLatestMaturityAssessment(userId)
  const profile = normalizeProfile(input.profile ?? current.profile)

  if (input.startNew && current.assessment) {
    const { error: archiveError } = await admin.schema('governance').from('maturity_assessments')
      .update({ status: 'ARCHIVED', updated_at: new Date().toISOString() })
      .eq('id', current.assessment.id)
      .eq('organization_id', membership.organizationId)
    if (archiveError) throw new Error(`Unable to archive previous maturity assessment: ${archiveError.message}`)
  } else if (current.assessment) {
    const { data, error } = await admin.schema('governance').from('maturity_assessments').update({
      organization_profile: profile,
      updated_at: new Date().toISOString(),
    }).eq('id', current.assessment.id)
      .eq('organization_id', membership.organizationId)
      .select('id,organization_id,framework_version,status,organization_profile,scorecard,created_at,updated_at,completed_at')
      .single()
    if (error) throw new Error(`Unable to update maturity assessment: ${error.message}`)
    await refreshScorecard(data as StoredAssessment)
    return data as StoredAssessment
  }

  const { data, error } = await admin.schema('governance').from('maturity_assessments').insert({
    organization_id: membership.organizationId,
    framework_version: GOVERNANCE_MATURITY_FRAMEWORK_VERSION,
    organization_profile: profile,
    scorecard: {},
    created_by: userId,
  }).select('id,organization_id,framework_version,status,organization_profile,scorecard,created_at,updated_at,completed_at').single()
  if (error) throw new Error(`Unable to create maturity assessment: ${error.message}`)
  return data as StoredAssessment
}

export async function saveMaturityResponses(
  userId: string,
  assessmentId: string,
  inputResponses: unknown,
) {
  const membership = await resolveInstanceOrganizationMembership(userId)
  const admin = createAdminClient()
  const { data: assessmentData, error: assessmentError } = await admin.schema('governance').from('maturity_assessments')
    .select('id,organization_id,framework_version,status,organization_profile,scorecard,created_at,updated_at,completed_at')
    .eq('id', assessmentId)
    .maybeSingle()
  if (assessmentError) throw new Error(`Unable to resolve maturity assessment: ${assessmentError.message}`)
  if (!assessmentData) throw new AuthorizationError('Maturity assessment was not found.', 404)
  const assessment = assessmentData as StoredAssessment
  if (assessment.organization_id !== membership.organizationId) throw new AuthorizationError('Assessment organization scope rejected.')

  const profile = normalizeProfile(assessment.organization_profile)
  const applicableIds = new Set(questionsForProfile(profile).map(question => question.id))
  const knownQuestionIds = new Set(GOVERNANCE_MATURITY_QUESTIONS.map(question => question.id))
  const source = Array.isArray(inputResponses) ? inputResponses : []
  const rows = source.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const value = item as Record<string, unknown>
    const questionId = typeof value.questionId === 'string' ? value.questionId.trim() : ''
    if (!knownQuestionIds.has(questionId) || !applicableIds.has(questionId) || !validLevel(value.maturity)) return []
    const priority = ['HIGH','MEDIUM','LOW'].includes(String(value.priority)) ? String(value.priority) as AssessmentPriority : 'MEDIUM'
    const canSetTarget = isAdministrator(membership.organizationRole)
    return [{
      assessment_id: assessmentId,
      question_id: questionId,
      respondent_user_id: userId,
      maturity: Number(value.maturity),
      target: canSetTarget && validLevel(value.target) ? Number(value.target) : null,
      priority,
      evidence_confidence: validPercent(value.evidenceConfidence) ? Number(value.evidenceConfidence) : null,
      coverage: validPercent(value.coverage) ? Number(value.coverage) : null,
      comment: typeof value.comment === 'string' ? value.comment.trim().slice(0, 4000) : null,
      updated_at: new Date().toISOString(),
    }]
  })
  if (!rows.length) throw new Error('At least one valid applicable maturity response is required.')

  const { error } = await admin.schema('governance').from('maturity_assessment_responses').upsert(rows, {
    onConflict: 'assessment_id,question_id,respondent_user_id',
  })
  if (error) throw new Error(`Unable to save maturity responses: ${error.message}`)
  return refreshScorecard(assessment)
}

export async function addMaturityEvidence(
  userId: string,
  input: { assessmentId: string; questionId: string; evidenceType: string; label: string; referenceUri?: string; metadata?: Record<string, unknown> },
) {
  const membership = await resolveInstanceOrganizationMembership(userId)
  const admin = createAdminClient()
  const { data: assessment, error: assessmentError } = await admin.schema('governance').from('maturity_assessments')
    .select('id,organization_id,organization_profile')
    .eq('id', input.assessmentId)
    .maybeSingle()
  if (assessmentError) throw new Error(`Unable to resolve maturity assessment: ${assessmentError.message}`)
  if (!assessment || String(assessment.organization_id) !== membership.organizationId) throw new AuthorizationError('Assessment organization scope rejected.')

  const allowedTypes = new Set(['DOCUMENT','URL','CONTROL_REPORT','SYSTEM_CONNECTION','OWNER_ATTESTATION','AUDIT_RESULT','COMMENT'])
  if (!allowedTypes.has(input.evidenceType)) throw new Error('Unsupported maturity evidence type.')
  if (!input.label.trim()) throw new Error('Evidence label is required.')
  if (!questionsForProfile(normalizeProfile(assessment.organization_profile)).some(question => question.id === input.questionId)) {
    throw new Error('Evidence question is not applicable to this assessment.')
  }

  const { data: response } = await admin.schema('governance').from('maturity_assessment_responses')
    .select('id').eq('assessment_id', input.assessmentId).eq('question_id', input.questionId).eq('respondent_user_id', userId).maybeSingle()

  const { data, error } = await admin.schema('governance').from('maturity_assessment_evidence').insert({
    assessment_id: input.assessmentId,
    response_id: response?.id ?? null,
    question_id: input.questionId,
    evidence_type: input.evidenceType,
    label: input.label.trim().slice(0, 500),
    reference_uri: input.referenceUri?.trim().slice(0, 4000) || null,
    metadata: input.metadata ?? {},
    provided_by: userId,
  }).select('id,question_id,evidence_type,label,reference_uri,verification_state,provided_at').single()
  if (error) throw new Error(`Unable to add maturity evidence: ${error.message}`)
  return data
}
