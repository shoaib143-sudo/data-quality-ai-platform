import { createAdminClient } from '@/lib/supabase/admin'
import {
  promoteVerifiedGovernedActionOutcome,
  recordGovernedActionOutcome,
} from '@/lib/governance/governed-outcome-learning'

type JsonRecord = Record<string, any>

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

async function promoteIfEligible(projectId: string, outcome: JsonRecord, actorUserId?: string | null) {
  if (outcome.verification_state !== 'VERIFIED' || !outcome.source_agent_run_id) {
    return { learningEligible: false, learningCaseId: null, reason: outcome.source_agent_run_id ? 'OUTCOME_NOT_VERIFIED' : 'SOURCE_AGENT_RUN_REQUIRED' }
  }
  const promoted = await promoteVerifiedGovernedActionOutcome({ projectId, outcomeId: outcome.id, actorUserId })
  return { learningEligible: true, learningCaseId: promoted.learningCaseId, reason: null }
}

async function verifyIssueCreation(projectId: string, action: JsonRecord, actorUserId?: string | null) {
  const admin = createAdminClient()
  const result = record(action.result)
  const issueId = text(result.issueId) || text(result.issue_id) || text(record(result.issue).id)
  const beforeEvidence = {
    autonomy_action_id: action.id,
    action_key: action.action_key,
    target_type: action.target_type,
    target_id: action.target_id ?? null,
    policy_id: action.policy_id,
    policy_version_id: action.policy_version_id,
    proposed_input: record(action.input),
  }

  if (!issueId) {
    const outcome = await recordGovernedActionOutcome({
      projectId,
      autonomyActionId: action.id,
      verificationKey: 'deterministic-issue-create-v1',
      recommendationType: action.action_key,
      recommendationVersion: '1.0',
      recommendation: { action_key: action.action_key, target_type: action.target_type, target_id: action.target_id ?? null },
      evidenceContext: { source: 'governance.autonomy_actions', action_result: result },
      beforeEvidence,
      afterEvidence: { persisted_issue_id: null, result_contains_issue_identifier: false },
      verificationState: 'VERIFIED',
      outcomeType: 'FAILED',
      effectiveness: 0,
      actorUserId,
      decisionReason: 'Executed issue-creation action has no persisted issue identifier.',
      runtimeEvidence: { production_source_mutation: false, verifier: 'CREATE_GOVERNANCE_ISSUE_V1' },
    })
    return { status: 'VERIFIED', outcome, ...(await promoteIfEligible(projectId, outcome as JsonRecord, actorUserId)) }
  }

  const { data: issue, error } = await admin.schema('governance').from('issues')
    .select('id,project_id,dataset_id,dataset_version_id,profile_run_id,status,severity,created_at,resolved_at')
    .eq('id', issueId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw new Error(`Unable to verify governed issue outcome: ${error.message}`)

  const exists = Boolean(issue)
  const outcome = await recordGovernedActionOutcome({
    projectId,
    autonomyActionId: action.id,
    verificationKey: 'deterministic-issue-create-v1',
    recommendationType: action.action_key,
    recommendationVersion: '1.0',
    recommendation: { action_key: action.action_key, target_type: action.target_type, target_id: action.target_id ?? null },
    evidenceContext: { source: 'governance.issues', issue_id: issueId },
    beforeEvidence,
    afterEvidence: exists ? { issue } : { issue_id: issueId, persisted_in_action_project: false },
    verificationState: 'VERIFIED',
    outcomeType: exists ? 'EFFECTIVE' : 'FAILED',
    effectiveness: exists ? 1 : 0,
    actorUserId,
    decisionReason: exists ? 'The governed issue exists in the action project.' : 'The issue referenced by the action does not exist in the action project.',
    runtimeEvidence: {
      production_source_mutation: false,
      verifier: 'CREATE_GOVERNANCE_ISSUE_V1',
      objective: 'PERSIST_GOVERNANCE_ISSUE',
      objective_satisfied: exists,
      business_remediation_claimed: false,
    },
  })
  return { status: 'VERIFIED', outcome, ...(await promoteIfEligible(projectId, outcome as JsonRecord, actorUserId)) }
}

async function priorCompletedProfile(admin: ReturnType<typeof createAdminClient>, datasetVersionId: string, startedAt: string) {
  const { data: run, error } = await admin.schema('profiling').from('profile_runs')
    .select('id,status,started_at,completed_at,row_count,column_count')
    .eq('dataset_version_id', datasetVersionId)
    .eq('status', 'COMPLETED')
    .lt('started_at', startedAt)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`Unable to load prior profiling baseline: ${error.message}`)
  if (!run) return null
  const { data: score, error: scoreError } = await admin.schema('profiling').from('data_quality_scores')
    .select('id,profile_run_id,completeness_score,uniqueness_score,validity_score,accuracy_score,overall_score,created_at')
    .eq('profile_run_id', run.id)
    .maybeSingle()
  if (scoreError) throw new Error(`Unable to load prior quality score: ${scoreError.message}`)
  return { run, score: score ?? null }
}

async function verifyReprofile(projectId: string, action: JsonRecord, actorUserId?: string | null) {
  const admin = createAdminClient()
  const result = record(action.result)
  const profileRunId = text(result.profiling_run_id) || text(result.profilingRunId)
  const datasetVersionId = action.target_type === 'DATASET_VERSION' ? text(action.target_id) : ''
  if (!profileRunId || !datasetVersionId) {
    return { status: 'INCONCLUSIVE', reason: 'REPROFILE_EVIDENCE_IDENTIFIER_MISSING', learningEligible: false }
  }

  const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions')
    .select('id,dataset_id')
    .eq('id', datasetVersionId)
    .maybeSingle()
  if (versionError) throw new Error(`Unable to validate reprofile dataset version: ${versionError.message}`)
  if (!version) throw new Error('Reprofile target dataset version no longer exists.')
  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets')
    .select('id,project_id,name')
    .eq('id', version.dataset_id)
    .eq('project_id', projectId)
    .maybeSingle()
  if (datasetError) throw new Error(`Unable to validate reprofile dataset project: ${datasetError.message}`)
  if (!dataset) throw new Error('Reprofile target does not belong to the governed action project.')

  const { data: profileRun, error: runError } = await admin.schema('profiling').from('profile_runs')
    .select('id,dataset_version_id,agent_run_id,status,engine_name,engine_version,row_count,column_count,started_at,completed_at,error_code,error_message')
    .eq('id', profileRunId)
    .eq('dataset_version_id', datasetVersionId)
    .maybeSingle()
  if (runError) throw new Error(`Unable to verify reprofile run: ${runError.message}`)
  if (!profileRun) throw new Error('Reprofile run is missing or belongs to a different dataset version.')

  const profileStatus = text(profileRun.status).toUpperCase()
  if (!['COMPLETED', 'FAILED'].includes(profileStatus)) {
    return {
      status: profileStatus === 'PARTIAL' ? 'INCONCLUSIVE' : 'PENDING',
      reason: `PROFILE_${profileStatus || 'NON_TERMINAL'}`,
      profileRunId,
      learningEligible: false,
    }
  }

  const before = await priorCompletedProfile(admin, datasetVersionId, profileRun.started_at)
  const beforeEvidence = before
    ? { profile_run: before.run, quality_score: before.score }
    : { baseline: 'NO_PRIOR_COMPLETED_PROFILE', autonomy_action_id: action.id, dataset_version_id: datasetVersionId }

  if (profileStatus === 'FAILED') {
    const outcome = await recordGovernedActionOutcome({
      projectId,
      autonomyActionId: action.id,
      verificationKey: `deterministic-reprofile-v1:${profileRunId}`,
      recommendationType: action.action_key,
      recommendationVersion: '1.0',
      recommendation: { action_key: action.action_key, dataset_version_id: datasetVersionId },
      evidenceContext: { source: 'profiling.profile_runs', profile_run_id: profileRunId },
      beforeEvidence,
      afterEvidence: { profile_run: profileRun },
      verificationState: 'VERIFIED',
      outcomeType: 'FAILED',
      effectiveness: 0,
      actorUserId,
      decisionReason: text(profileRun.error_message) || 'The governed reprofile run failed.',
      runtimeEvidence: {
        verifier: 'REQUEST_REPROFILE_V1',
        objective: 'PRODUCE_FRESH_PROFILE_EVIDENCE',
        objective_satisfied: false,
        quality_improvement_claimed: false,
        production_source_mutation: false,
      },
    })
    return { status: 'VERIFIED', outcome, ...(await promoteIfEligible(projectId, outcome as JsonRecord, actorUserId)) }
  }

  const { data: score, error: scoreError } = await admin.schema('profiling').from('data_quality_scores')
    .select('id,profile_run_id,completeness_score,uniqueness_score,validity_score,accuracy_score,overall_score,created_at')
    .eq('profile_run_id', profileRunId)
    .maybeSingle()
  if (scoreError) throw new Error(`Unable to verify reprofile quality score: ${scoreError.message}`)
  if (!score) return { status: 'INCONCLUSIVE', reason: 'QUALITY_SCORE_MISSING', profileRunId, learningEligible: false }

  const outcome = await recordGovernedActionOutcome({
    projectId,
    autonomyActionId: action.id,
    verificationKey: `deterministic-reprofile-v1:${profileRunId}`,
    recommendationType: action.action_key,
    recommendationVersion: '1.0',
    recommendation: { action_key: action.action_key, dataset_version_id: datasetVersionId },
    evidenceContext: { source: 'profiling.profile_runs+profiling.data_quality_scores', profile_run_id: profileRunId, quality_score_id: score.id },
    beforeEvidence,
    afterEvidence: { profile_run: profileRun, quality_score: score },
    verificationState: 'VERIFIED',
    outcomeType: 'EFFECTIVE',
    effectiveness: 1,
    actorUserId,
    decisionReason: 'The approved reprofile produced a completed profile with linked quality-score evidence.',
    runtimeEvidence: {
      verifier: 'REQUEST_REPROFILE_V1',
      objective: 'PRODUCE_FRESH_PROFILE_EVIDENCE',
      objective_satisfied: true,
      fresh_observed_evidence_produced: true,
      quality_improvement_claimed: false,
      production_source_mutation: false,
    },
  })
  return { status: 'VERIFIED', outcome, ...(await promoteIfEligible(projectId, outcome as JsonRecord, actorUserId)) }
}

export async function verifyExecutedGovernedAction(input: {
  projectId: string
  actionId: string
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const { data: action, error } = await admin.schema('governance').from('autonomy_actions')
    .select('*')
    .eq('id', input.actionId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve governed action for verification: ${error.message}`)
  if (!action) throw new Error('Governed autonomy action was not found in this project.')
  if (action.status === 'ROLLED_BACK') throw new Error('Rolled-back actions require separate rollback-outcome evidence and cannot be promoted as successful learning.')
  if (action.status !== 'EXECUTED') throw new Error(`Outcome verification requires an EXECUTED action, received ${action.status}.`)

  if (action.action_key === 'CREATE_GOVERNANCE_ISSUE') return verifyIssueCreation(input.projectId, action, input.actorUserId)
  if (action.action_key === 'REQUEST_REPROFILE') return verifyReprofile(input.projectId, action, input.actorUserId)
  throw new Error(`No deterministic governed outcome verifier is registered for ${action.action_key}.`)
}
