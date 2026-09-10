import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

type JsonRecord = Record<string, any>
type OutcomeStatus = 'PENDING' | 'VERIFIED' | 'FAILED' | 'UNKNOWN'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function record(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}
}

function numberOrNull(value: unknown) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

async function persistOutcome(input: {
  projectId: string
  action: JsonRecord
  verificationStatus: OutcomeStatus
  profileRunId?: string | null
  issueId?: string | null
  beforeState?: JsonRecord
  afterState?: JsonRecord
  verificationEvidence?: JsonRecord
  effectiveness?: number | null
  failureCode?: string | null
  failureDetail?: string | null
}) {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const verified = input.verificationStatus === 'VERIFIED'
  const payload = {
    project_id: input.projectId,
    autonomy_action_id: input.action.id,
    source_agent_run_id: input.action.source_agent_run_id ?? null,
    profile_run_id: input.profileRunId ?? null,
    issue_id: input.issueId ?? null,
    action_key: input.action.action_key,
    verification_status: input.verificationStatus,
    verifier_type: 'SYSTEM',
    before_state: input.beforeState ?? {},
    after_state: input.afterState ?? {},
    verification_evidence: input.verificationEvidence ?? {},
    effectiveness: input.effectiveness ?? null,
    failure_code: input.failureCode ?? null,
    failure_detail: input.failureDetail ?? null,
    verified_by: null,
    verified_at: verified ? now : null,
    updated_at: now,
  }
  const { data, error } = await admin.schema('governance').from('autonomy_action_outcomes')
    .upsert(payload, { onConflict: 'autonomy_action_id' })
    .select('*')
    .single()
  if (error || !data) throw new Error(`Unable to persist governed action outcome: ${error?.message ?? 'unknown error'}`)
  return data as JsonRecord
}

async function promoteVerifiedOutcome(action: JsonRecord, outcome: JsonRecord) {
  if (outcome.verification_status !== 'VERIFIED' || !outcome.verified_at || numberOrNull(outcome.effectiveness) === null) {
    return { learningCase: null, learningEligible: false, reason: 'OUTCOME_NOT_VERIFIED' }
  }
  if (!action.source_agent_run_id) {
    return { learningCase: null, learningEligible: false, reason: 'SOURCE_AGENT_RUN_REQUIRED' }
  }
  if (outcome.learning_case_id) {
    return { learningCase: { id: outcome.learning_case_id }, learningEligible: true, reason: null }
  }

  const admin = createAdminClient()
  const { data: sourceRun, error: sourceRunError } = await admin.schema('agent').from('agent_runs')
    .select('id,project_id,agent_definition_id,status,completed_at')
    .eq('id', action.source_agent_run_id)
    .eq('project_id', action.project_id)
    .maybeSingle()
  if (sourceRunError) throw new Error(`Unable to resolve source agent run for outcome learning: ${sourceRunError.message}`)
  if (!sourceRun) return { learningCase: null, learningEligible: false, reason: 'SOURCE_AGENT_RUN_NOT_FOUND' }

  const caseKey = `autonomy-action:${action.id}`
  const { data: learningCase, error: learningError } = await admin.schema('agent').from('agent_learning_cases')
    .upsert({
      project_id: action.project_id,
      agent_definition_id: sourceRun.agent_definition_id,
      source_agent_run_id: sourceRun.id,
      case_key: caseKey,
      source_kind: 'AUTONOMY_ACTION_OUTCOME',
      problem_type: action.action_key,
      context: {
        autonomy_action_id: action.id,
        target_type: action.target_type,
        target_id: action.target_id ?? null,
        risk_level: action.risk_level,
        policy_id: action.policy_id,
        policy_version_id: action.policy_version_id,
        execution_status: action.status,
      },
      recommendation: {
        action_key: action.action_key,
        target_type: action.target_type,
        target_id: action.target_id ?? null,
        note: 'Historical governed action only. Reuse requires a fresh policy decision for the current case.',
      },
      decision_status: 'VERIFIED',
      outcome_status: 'VERIFIED',
      effectiveness: outcome.effectiveness,
      confidence: action.confidence,
      evidence: {
        autonomy_action_id: action.id,
        autonomy_action_outcome_id: outcome.id,
        verification_evidence: record(outcome.verification_evidence),
        before_state: record(outcome.before_state),
        after_state: record(outcome.after_state),
        authority: 'VERIFIED_OUTCOME_CONTEXT_ONLY',
        policy_re_evaluation_required: true,
      },
      status: 'ACTIVE',
      occurred_at: outcome.verified_at,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id,case_key' })
    .select('id,project_id,case_key,decision_status,outcome_status,effectiveness,confidence,status')
    .single()
  if (learningError || !learningCase) throw new Error(`Unable to promote verified action outcome into learning: ${learningError?.message ?? 'unknown error'}`)

  const { data: linkedOutcome, error: linkError } = await admin.schema('governance').from('autonomy_action_outcomes')
    .update({ learning_case_id: learningCase.id, updated_at: new Date().toISOString() })
    .eq('id', outcome.id)
    .eq('verification_status', 'VERIFIED')
    .select('*')
    .single()
  if (linkError || !linkedOutcome) throw new Error(`Unable to link verified outcome learning case: ${linkError?.message ?? 'unknown error'}`)

  return { learningCase, learningEligible: true, reason: null, linkedOutcome }
}

async function verifyIssueCreation(projectId: string, action: JsonRecord) {
  const admin = createAdminClient()
  const result = record(action.result)
  const issueId = text(result.issueId) || text(result.issue_id) || text(record(result.issue).id)
  if (!issueId) {
    return persistOutcome({
      projectId,
      action,
      verificationStatus: 'UNKNOWN',
      failureCode: 'ISSUE_ID_MISSING',
      failureDetail: 'Executed issue-creation action does not contain a persisted issue identifier.',
      verificationEvidence: { autonomy_action_id: action.id, execution_status: action.status },
    })
  }
  const { data: issue, error } = await admin.schema('governance').from('issues')
    .select('id,project_id,status,severity,created_at,resolved_at')
    .eq('id', issueId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw new Error(`Unable to verify governed issue outcome: ${error.message}`)
  if (!issue) {
    return persistOutcome({
      projectId,
      action,
      issueId,
      verificationStatus: 'FAILED',
      failureCode: 'ISSUE_NOT_FOUND',
      failureDetail: 'The issue referenced by the executed autonomy action does not exist in the action project.',
      verificationEvidence: { autonomy_action_id: action.id, issue_id: issueId },
    })
  }
  return persistOutcome({
    projectId,
    action,
    issueId,
    verificationStatus: 'VERIFIED',
    effectiveness: 1,
    afterState: { issue },
    verificationEvidence: {
      source: 'governance.issues',
      issue_id: issue.id,
      project_id: issue.project_id,
      objective: 'CREATE_GOVERNANCE_ISSUE',
      objective_satisfied: true,
      business_remediation_claimed: false,
    },
  })
}

async function priorCompletedProfile(admin: ReturnType<typeof createAdminClient>, datasetVersionId: string, startedAt: string) {
  const { data: priorRun, error: priorError } = await admin.schema('profiling').from('profile_runs')
    .select('id,status,started_at,completed_at,row_count,column_count')
    .eq('dataset_version_id', datasetVersionId)
    .eq('status', 'COMPLETED')
    .lt('started_at', startedAt)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (priorError) throw new Error(`Unable to load prior profiling baseline: ${priorError.message}`)
  if (!priorRun) return null
  const { data: priorScore, error: scoreError } = await admin.schema('profiling').from('data_quality_scores')
    .select('id,profile_run_id,completeness_score,uniqueness_score,validity_score,accuracy_score,overall_score,created_at')
    .eq('profile_run_id', priorRun.id)
    .maybeSingle()
  if (scoreError) throw new Error(`Unable to load prior data quality score: ${scoreError.message}`)
  return { run: priorRun, score: priorScore ?? null }
}

async function verifyReprofile(projectId: string, action: JsonRecord) {
  const admin = createAdminClient()
  const result = record(action.result)
  const input = record(action.input)
  const profileRunId = text(result.profilingRunId) || text(result.profiling_run_id)
  const datasetVersionId = text(input.datasetVersionId ?? input.dataset_version_id) || (action.target_type === 'DATASET_VERSION' ? text(action.target_id) : '')
  if (!profileRunId || !datasetVersionId) {
    return persistOutcome({
      projectId,
      action,
      profileRunId: profileRunId || null,
      verificationStatus: 'UNKNOWN',
      failureCode: 'REPROFILE_EVIDENCE_ID_MISSING',
      failureDetail: 'Executed reprofile action is missing its profile-run or dataset-version evidence identifier.',
      verificationEvidence: { autonomy_action_id: action.id, execution_status: action.status },
    })
  }

  const { data: profileRun, error: runError } = await admin.schema('profiling').from('profile_runs')
    .select('id,dataset_version_id,agent_run_id,status,engine_name,engine_version,row_count,column_count,started_at,completed_at,error_code,error_message')
    .eq('id', profileRunId)
    .eq('dataset_version_id', datasetVersionId)
    .maybeSingle()
  if (runError) throw new Error(`Unable to verify reprofile run: ${runError.message}`)
  if (!profileRun) {
    return persistOutcome({
      projectId,
      action,
      profileRunId,
      verificationStatus: 'FAILED',
      failureCode: 'PROFILE_RUN_NOT_FOUND',
      failureDetail: 'The profile run referenced by the action is missing or belongs to a different dataset version.',
      verificationEvidence: { autonomy_action_id: action.id, profile_run_id: profileRunId, dataset_version_id: datasetVersionId },
    })
  }

  const { data: datasetVersion, error: versionError } = await admin.schema('catalog').from('dataset_versions')
    .select('id,dataset_id')
    .eq('id', datasetVersionId)
    .maybeSingle()
  if (versionError) throw new Error(`Unable to verify reprofile dataset version: ${versionError.message}`)
  if (!datasetVersion) throw new Error('Reprofile outcome dataset version no longer exists.')
  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets')
    .select('id,project_id,name')
    .eq('id', datasetVersion.dataset_id)
    .eq('project_id', projectId)
    .maybeSingle()
  if (datasetError) throw new Error(`Unable to verify reprofile dataset project: ${datasetError.message}`)
  if (!dataset) throw new Error('Reprofile outcome dataset does not belong to the requested project.')

  const status = text(profileRun.status).toUpperCase()
  const commonEvidence = {
    source: 'profiling.profile_runs',
    profile_run_id: profileRun.id,
    dataset_version_id: datasetVersionId,
    dataset_id: dataset.id,
    project_id: projectId,
    profile_status: status,
  }
  if (status === 'FAILED') {
    return persistOutcome({
      projectId,
      action,
      profileRunId,
      verificationStatus: 'FAILED',
      failureCode: text(profileRun.error_code) || 'PROFILE_RUN_FAILED',
      failureDetail: text(profileRun.error_message) || 'The governed reprofile run failed.',
      afterState: { profileRun },
      verificationEvidence: commonEvidence,
    })
  }
  if (status === 'PARTIAL') {
    return persistOutcome({
      projectId,
      action,
      profileRunId,
      verificationStatus: 'UNKNOWN',
      failureCode: 'PROFILE_RUN_PARTIAL',
      failureDetail: 'A partial profile does not satisfy the verified fresh-evidence outcome contract.',
      afterState: { profileRun },
      verificationEvidence: commonEvidence,
    })
  }
  if (status !== 'COMPLETED') {
    return persistOutcome({
      projectId,
      action,
      profileRunId,
      verificationStatus: 'PENDING',
      afterState: { profileRun },
      verificationEvidence: commonEvidence,
    })
  }

  const { data: score, error: scoreError } = await admin.schema('profiling').from('data_quality_scores')
    .select('id,profile_run_id,completeness_score,uniqueness_score,validity_score,accuracy_score,overall_score,created_at')
    .eq('profile_run_id', profileRunId)
    .maybeSingle()
  if (scoreError) throw new Error(`Unable to verify reprofile data quality score: ${scoreError.message}`)
  if (!score) {
    return persistOutcome({
      projectId,
      action,
      profileRunId,
      verificationStatus: 'UNKNOWN',
      failureCode: 'QUALITY_SCORE_MISSING',
      failureDetail: 'Completed profiling run has no linked data quality score, so fresh evidence is incomplete.',
      afterState: { profileRun },
      verificationEvidence: commonEvidence,
    })
  }

  const baseline = await priorCompletedProfile(admin, datasetVersionId, profileRun.started_at)
  return persistOutcome({
    projectId,
    action,
    profileRunId,
    verificationStatus: 'VERIFIED',
    effectiveness: 1,
    beforeState: baseline ? { profileRun: baseline.run, qualityScore: baseline.score } : { baseline: 'NO_PRIOR_COMPLETED_PROFILE' },
    afterState: { profileRun, qualityScore: score },
    verificationEvidence: {
      ...commonEvidence,
      score_source: 'profiling.data_quality_scores',
      quality_score_id: score.id,
      objective: 'REQUEST_REPROFILE',
      objective_satisfied: true,
      fresh_observed_evidence_produced: true,
      quality_improvement_claimed: false,
    },
  })
}

export async function verifyGovernedActionOutcome(input: {
  projectId: string
  actionId: string
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const { data: action, error: actionError } = await admin.schema('governance').from('autonomy_actions')
    .select('*')
    .eq('id', input.actionId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (actionError) throw new Error(`Unable to resolve governed action for outcome verification: ${actionError.message}`)
  if (!action) throw new Error('Governed autonomy action was not found in this project.')
  if (action.status === 'ROLLED_BACK') throw new Error('Rolled-back autonomy actions cannot produce reusable verified outcomes.')
  if (action.status !== 'EXECUTED') throw new Error(`Outcome verification requires an EXECUTED action, received ${action.status}.`)

  const { data: existing, error: existingError } = await admin.schema('governance').from('autonomy_action_outcomes')
    .select('*')
    .eq('autonomy_action_id', action.id)
    .maybeSingle()
  if (existingError) throw new Error(`Unable to resolve prior governed action outcome: ${existingError.message}`)
  if (existing?.verification_status === 'VERIFIED' && existing.learning_case_id) {
    return { action, outcome: existing, learningCase: { id: existing.learning_case_id }, learningEligible: true, reused: true }
  }

  const outcome = action.action_key === 'CREATE_GOVERNANCE_ISSUE'
    ? await verifyIssueCreation(input.projectId, action)
    : action.action_key === 'REQUEST_REPROFILE'
      ? await verifyReprofile(input.projectId, action)
      : await persistOutcome({
          projectId: input.projectId,
          action,
          verificationStatus: 'UNKNOWN',
          failureCode: 'OUTCOME_VERIFIER_NOT_IMPLEMENTED',
          failureDetail: `No deterministic outcome verifier is registered for ${action.action_key}.`,
          verificationEvidence: { autonomy_action_id: action.id, action_key: action.action_key },
        })

  const learning = outcome.verification_status === 'VERIFIED'
    ? await promoteVerifiedOutcome(action, outcome)
    : { learningCase: null, learningEligible: false, reason: `OUTCOME_${outcome.verification_status}` }
  const finalOutcome = 'linkedOutcome' in learning && learning.linkedOutcome ? learning.linkedOutcome : outcome

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? 'USER' : 'SYSTEM',
    eventType: outcome.verification_status === 'VERIFIED' ? 'GOVERNED_AUTONOMY_OUTCOME_VERIFIED' : 'GOVERNED_AUTONOMY_OUTCOME_OBSERVED',
    entityType: action.target_type,
    entityId: action.target_id ?? action.id,
    correlationId: action.id,
    metadata: {
      autonomy_action_id: action.id,
      autonomy_action_outcome_id: outcome.id,
      action_key: action.action_key,
      verification_status: outcome.verification_status,
      learning_case_id: finalOutcome.learning_case_id ?? null,
      learning_eligible: learning.learningEligible,
      learning_reason: learning.reason ?? null,
      execution_is_not_outcome: true,
      verified_learning_requires_verified_outcome: true,
    },
  })

  return { action, outcome: finalOutcome, ...learning, reused: false }
}

export async function invalidateGovernedActionOutcome(input: {
  projectId: string
  actionId: string
  actorUserId: string
  reason: string
}) {
  const admin = createAdminClient()
  const { data: outcome, error } = await admin.schema('governance').from('autonomy_action_outcomes')
    .select('*')
    .eq('project_id', input.projectId)
    .eq('autonomy_action_id', input.actionId)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve governed action outcome for invalidation: ${error.message}`)
  if (!outcome) return null

  if (outcome.learning_case_id) {
    const { error: revokeError } = await admin.schema('agent').from('agent_learning_cases').update({
      status: 'REVOKED',
      outcome_status: 'UNKNOWN',
      updated_at: new Date().toISOString(),
    }).eq('id', outcome.learning_case_id).eq('project_id', input.projectId)
    if (revokeError) throw new Error(`Unable to revoke learning from invalidated action outcome: ${revokeError.message}`)
  }

  const { data: invalidated, error: updateError } = await admin.schema('governance').from('autonomy_action_outcomes').update({
    verification_status: 'UNKNOWN',
    effectiveness: null,
    failure_code: 'ACTION_INVALIDATED',
    failure_detail: input.reason.slice(0, 2000),
    learning_case_id: null,
    verified_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', outcome.id).select('*').single()
  if (updateError || !invalidated) throw new Error(`Unable to invalidate governed action outcome: ${updateError?.message ?? 'unknown error'}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId,
    actorType: 'USER',
    eventType: 'GOVERNED_AUTONOMY_OUTCOME_INVALIDATED',
    entityType: 'AUTONOMY_ACTION',
    entityId: input.actionId,
    correlationId: input.actionId,
    metadata: {
      autonomy_action_id: input.actionId,
      autonomy_action_outcome_id: outcome.id,
      revoked_learning_case_id: outcome.learning_case_id ?? null,
      reason: input.reason,
    },
  })
  return invalidated
}
