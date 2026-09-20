import { createAdminClient } from '@/lib/supabase/admin'
import {
  createAgentApprovalRequest,
  currentExecutionFingerprint,
  validateApprovalForExecution,
} from '@/lib/governance/agent-approval-service'

type LearningCandidateReleaseContext = {
  candidateId: string
  projectId: string
  agentKey: string
  baselineVersion: string
  candidateVersion: string
  benchmarkId: string
  rollbackRef: string
  agentDefinitionId: string
}

async function loadLearningCandidateReleaseContext(input: {
  projectId: string
  candidateId: string
}): Promise<LearningCandidateReleaseContext> {
  const admin = createAdminClient()
  const { data: candidate, error: candidateError } = await admin.schema('agent')
    .from('learning_candidates')
    .select('id,project_id,agent_key,baseline_version,candidate_version,status')
    .eq('id', input.candidateId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (candidateError) throw new Error(`Unable to load learning candidate: ${candidateError.message}`)
  if (!candidate) throw new Error('Learning candidate was not found in project.')
  if (candidate.status !== 'REVIEW_REQUIRED') {
    throw new Error(`Learning candidate must be REVIEW_REQUIRED before release approval. Current status: ${candidate.status}.`)
  }

  const { data: benchmark, error: benchmarkError } = await admin.schema('agent')
    .from('learning_candidate_benchmarks')
    .select('id,candidate_id,gate_status,rollback_ref')
    .eq('candidate_id', input.candidateId)
    .eq('project_id', input.projectId)
    .maybeSingle()
  if (benchmarkError) throw new Error(`Unable to load learning candidate benchmark: ${benchmarkError.message}`)
  if (!benchmark || benchmark.gate_status !== 'REVIEW_REQUIRED') {
    throw new Error('Learning candidate requires a passing independent benchmark before release approval.')
  }

  const { data: agentDefinition, error: definitionError } = await admin.schema('agent')
    .from('agent_definitions')
    .select('id,agent_key,version')
    .eq('agent_key', candidate.agent_key)
    .eq('version', candidate.candidate_version)
    .maybeSingle()
  if (definitionError) throw new Error(`Unable to resolve candidate agent definition: ${definitionError.message}`)
  if (!agentDefinition) {
    throw new Error('Candidate version is not registered as an immutable agent definition.')
  }

  const { data: lifecycle, error: lifecycleError } = await admin.schema('agent')
    .from('agent_version_lifecycle')
    .select('agent_definition_id,lifecycle_state')
    .eq('agent_definition_id', agentDefinition.id)
    .maybeSingle()
  if (lifecycleError) throw new Error(`Unable to load candidate agent version lifecycle: ${lifecycleError.message}`)
  if (!lifecycle || lifecycle.lifecycle_state !== 'CANDIDATE') {
    throw new Error('Candidate agent definition must be in CANDIDATE lifecycle state before release approval.')
  }

  return {
    candidateId: String(candidate.id),
    projectId: String(candidate.project_id),
    agentKey: String(candidate.agent_key),
    baselineVersion: String(candidate.baseline_version),
    candidateVersion: String(candidate.candidate_version),
    benchmarkId: String(benchmark.id),
    rollbackRef: String(benchmark.rollback_ref),
    agentDefinitionId: String(agentDefinition.id),
  }
}

function releaseParameters(context: LearningCandidateReleaseContext) {
  return {
    candidateId: context.candidateId,
    agentKey: context.agentKey,
    baselineVersion: context.baselineVersion,
    candidateVersion: context.candidateVersion,
    benchmarkId: context.benchmarkId,
    rollbackRef: context.rollbackRef,
    agentDefinitionId: context.agentDefinitionId,
  }
}

export async function requestGovernedLearningCandidateReleaseApproval(input: {
  projectId: string
  candidateId: string
  requestedBy: string
}) {
  const context = await loadLearningCandidateReleaseContext(input)
  const { approval, riskContext } = await createAgentApprovalRequest({
    requestedBy: input.requestedBy,
    actionKey: 'PROMOTE_LEARNING_CANDIDATE',
    projectId: context.projectId,
    parameters: releaseParameters(context),
  })

  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('bind_learning_candidate_approval_request', {
    p_project_id: context.projectId,
    p_candidate_id: context.candidateId,
    p_approval_request_id: approval.id,
    p_requested_by: input.requestedBy,
  })
  if (error || !data) {
    throw new Error(`Unable to bind learning candidate approval request: ${error?.message ?? 'no approval link id returned'}`)
  }

  return { approval, riskContext, approvalLinkId: String(data), context }
}

export async function approveGovernedLearningCandidateForControlledRelease(input: {
  projectId: string
  candidateId: string
  approvalRequestId: string
  executorUserId: string
}) {
  const context = await loadLearningCandidateReleaseContext(input)
  const currentFingerprint = await currentExecutionFingerprint({
    requestId: input.approvalRequestId,
    parameters: releaseParameters(context),
  })
  const approval = await validateApprovalForExecution({
    requestId: input.approvalRequestId,
    executorUserId: input.executorUserId,
    currentFingerprint,
    expectedActionKey: 'PROMOTE_LEARNING_CANDIDATE',
  })

  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('approve_learning_candidate_for_controlled_release', {
    p_project_id: context.projectId,
    p_candidate_id: context.candidateId,
    p_approval_request_id: input.approvalRequestId,
    p_actor_user_id: input.executorUserId,
  })
  if (error || !data) {
    throw new Error(`Unable to mark learning candidate approved for controlled release: ${error?.message ?? 'no candidate id returned'}`)
  }

  return {
    candidateId: String(data),
    approval,
    context,
    currentFingerprint,
  }
}
