import { authorizeProject } from '@/lib/auth/authorize'
import {
  currentExecutionFingerprint,
  validateApprovalForExecution,
} from '@/lib/governance/agent-approval-service'
import { createAdminClient } from '@/lib/supabase/admin'

async function loadReleaseParameters(input: {
  projectId: string
  candidateId: string
  approvalRequestId: string
}) {
  const admin = createAdminClient()
  const { data: link, error: linkError } = await admin.schema('agent')
    .from('learning_candidate_approval_links')
    .select('candidate_id,benchmark_id,approval_request_id,agent_definition_id')
    .eq('project_id', input.projectId)
    .eq('candidate_id', input.candidateId)
    .eq('approval_request_id', input.approvalRequestId)
    .maybeSingle()
  if (linkError) throw new Error(`Unable to load learning release approval link: ${linkError.message}`)
  if (!link) throw new Error('Learning release approval link was not found.')

  const [{ data: candidate, error: candidateError }, { data: benchmark, error: benchmarkError }] = await Promise.all([
    admin.schema('agent').from('learning_candidates')
      .select('id,project_id,agent_key,skill_key,baseline_version,candidate_version,status')
      .eq('id', input.candidateId)
      .eq('project_id', input.projectId)
      .maybeSingle(),
    admin.schema('agent').from('learning_candidate_benchmarks')
      .select('id,rollback_ref,gate_status')
      .eq('id', link.benchmark_id)
      .eq('project_id', input.projectId)
      .maybeSingle(),
  ])
  if (candidateError) throw new Error(`Unable to load learning candidate: ${candidateError.message}`)
  if (benchmarkError) throw new Error(`Unable to load learning benchmark: ${benchmarkError.message}`)
  if (!candidate || !benchmark) throw new Error('Learning release context is incomplete.')
  if (benchmark.gate_status !== 'REVIEW_REQUIRED') throw new Error('Learning release benchmark is not eligible for release.')

  return {
    candidate,
    benchmark,
    link,
    parameters: {
      candidateId: String(candidate.id),
      agentKey: String(candidate.agent_key),
      baselineVersion: String(candidate.baseline_version),
      candidateVersion: String(candidate.candidate_version),
      benchmarkId: String(benchmark.id),
      rollbackRef: String(benchmark.rollback_ref),
      agentDefinitionId: String(link.agent_definition_id),
    },
  }
}

async function revalidateReleaseApproval(input: {
  projectId: string
  candidateId: string
  approvalRequestId: string
  actorUserId: string
}) {
  const context = await loadReleaseParameters(input)
  const currentFingerprint = await currentExecutionFingerprint({
    requestId: input.approvalRequestId,
    parameters: context.parameters,
  })
  const approval = await validateApprovalForExecution({
    requestId: input.approvalRequestId,
    executorUserId: input.actorUserId,
    currentFingerprint,
    expectedActionKey: 'PROMOTE_LEARNING_CANDIDATE',
  })
  return { ...context, approval, currentFingerprint }
}

export async function startGovernedLearningCanary(input: {
  projectId: string
  candidateId: string
  approvalRequestId: string
  actorUserId: string
  minimumCaseCount?: number
  minimumAverageScore?: number
}) {
  await revalidateReleaseApproval(input)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('start_learning_candidate_canary', {
    p_project_id: input.projectId,
    p_candidate_id: input.candidateId,
    p_approval_request_id: input.approvalRequestId,
    p_actor_user_id: input.actorUserId,
    p_minimum_case_count: input.minimumCaseCount ?? 20,
    p_minimum_average_score: input.minimumAverageScore ?? 0.8,
  })
  if (error || !data) throw new Error(`Unable to start learning canary: ${error?.message ?? 'no release id returned'}`)
  return String(data)
}

export async function recordGovernedLearningCanaryEvidence(input: {
  projectId: string
  releaseId: string
  evaluationResultIds: string[]
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('record_learning_candidate_canary_evidence', {
    p_project_id: input.projectId,
    p_release_id: input.releaseId,
    p_evaluation_result_ids: input.evaluationResultIds,
  })
  if (error) throw new Error(`Unable to record learning canary evidence: ${error.message}`)
  return Number(data ?? 0)
}

export async function evaluateGovernedLearningCanary(input: {
  projectId: string
  releaseId: string
  actorUserId: string
}) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('evaluate_learning_candidate_canary', {
    p_project_id: input.projectId,
    p_release_id: input.releaseId,
    p_actor_user_id: input.actorUserId,
  })
  if (error || !data) throw new Error(`Unable to evaluate learning canary: ${error?.message ?? 'no release state returned'}`)
  return data
}

export async function activateGovernedLearningCandidate(input: {
  projectId: string
  candidateId: string
  approvalRequestId: string
  actorUserId: string
}) {
  const context = await revalidateReleaseApproval(input)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('activate_learning_candidate', {
    p_project_id: input.projectId,
    p_candidate_id: input.candidateId,
    p_approval_request_id: input.approvalRequestId,
    p_actor_user_id: input.actorUserId,
  })
  if (error || !data) throw new Error(`Unable to activate learning candidate: ${error?.message ?? 'no candidate id returned'}`)
  return {
    candidateId: String(data),
    currentFingerprint: context.currentFingerprint,
  }
}

export async function rollbackGovernedLearningCandidate(input: {
  projectId: string
  candidateId: string
  actorUserId: string
  reason: string
}) {
  const reason = input.reason.trim()
  if (!reason) throw new Error('Learning candidate rollback reason is required.')
  await authorizeProject(input.actorUserId, input.projectId, 'agent.admin')

  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('rollback_learning_candidate', {
    p_project_id: input.projectId,
    p_candidate_id: input.candidateId,
    p_actor_user_id: input.actorUserId,
    p_reason: reason,
  })
  if (error || !data) throw new Error(`Unable to rollback learning candidate: ${error?.message ?? 'no candidate id returned'}`)
  return String(data)
}
