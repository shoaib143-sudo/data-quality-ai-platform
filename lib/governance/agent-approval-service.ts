import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeDataset, authorizeProject } from '@/lib/auth/authorize'
import { authorizeAgentAction } from './agent-authorization'
import { getAgentActionProfile } from './agent-action-catalog'
import { resolveDatasetRiskContext, resolveProjectRiskContext } from './agent-risk-context'
import {
  AGENT_POLICY_VERSION,
  approvalRequirement,
  type ApprovalAxis,
  type BusinessCriticality,
  type EnvironmentClass,
  type ExecutionFingerprintInput,
  type RiskLevel,
} from './agent-policy-v2'
import { createExecutionFingerprint, canonicalExecutionFingerprintPayload } from './execution-fingerprint'
import { enqueueApprovalNotifications } from './approval-notifications'

export type ApprovalChannel = 'DATANEXUS' | 'EMAIL' | 'TEAMS'
export type ApprovalDecision = 'APPROVED' | 'REJECTED'

export type CreateAgentApprovalRequestInput = {
  requestedBy: string
  actionKey: string
  projectId?: string | null
  datasetId?: string | null
  parameters: Record<string, unknown>
}

type AuthoritativeApprovalContext = {
  projectId: string
  domain: string
  environment: EnvironmentClass
  policyVersion: string
  targetType: 'PROJECT' | 'DATASET'
  targetId: string
  resourceIds: string[]
  businessCriticality: BusinessCriticality
  dataSensitivity: 'LOW' | 'MEDIUM' | 'HIGH' | 'RESTRICTED'
}

function addBusinessDays(start: Date, days: number): Date {
  const value = new Date(start)
  let remaining = Math.max(0, days)
  while (remaining > 0) {
    value.setUTCDate(value.getUTCDate() + 1)
    const weekday = value.getUTCDay()
    if (weekday !== 0 && weekday !== 6) remaining -= 1
  }
  return value
}

async function resolveAuthoritativeApprovalContext(input: CreateAgentApprovalRequestInput) {
  const profile = getAgentActionProfile(input.actionKey)
  const requestedProjectId = String(input.projectId ?? '').trim()
  const requestedDatasetId = String(input.datasetId ?? '').trim()

  let context: AuthoritativeApprovalContext
  if (profile.target === 'DATASET') {
    if (!requestedDatasetId) throw new Error('datasetId is required for this action.')
    const riskContext = await resolveDatasetRiskContext(requestedDatasetId)
    if (requestedProjectId && requestedProjectId !== riskContext.projectId) {
      throw new Error('Dataset does not belong to the requested project.')
    }
    await authorizeAgentAction(input.requestedBy, profile.requestCapability, {
      type: 'DATASET',
      projectId: riskContext.projectId,
      datasetId: requestedDatasetId,
    })
    context = {
      projectId: riskContext.projectId,
      domain: riskContext.domain,
      environment: 'PRODUCTION',
      policyVersion: AGENT_POLICY_VERSION,
      targetType: 'DATASET',
      targetId: requestedDatasetId,
      resourceIds: [requestedDatasetId],
      businessCriticality: riskContext.businessCriticality,
      dataSensitivity: riskContext.dataSensitivity,
    }
  } else {
    if (!requestedProjectId) throw new Error('projectId is required for this action.')
    const riskContext = await resolveProjectRiskContext(requestedProjectId)
    await authorizeAgentAction(input.requestedBy, profile.requestCapability, {
      type: 'PROJECT',
      projectId: riskContext.projectId,
    })
    context = {
      projectId: riskContext.projectId,
      domain: riskContext.domain,
      environment: 'PRODUCTION',
      policyVersion: AGENT_POLICY_VERSION,
      targetType: 'PROJECT',
      targetId: riskContext.projectId,
      resourceIds: riskContext.resourceIds,
      businessCriticality: riskContext.businessCriticality,
      dataSensitivity: riskContext.dataSensitivity,
    }
  }

  const admin = createAdminClient()
  const { data: projectPolicy, error: policyError } = await admin.schema('governance')
    .from('project_agent_policy_context')
    .select('environment,policy_version')
    .eq('project_id', context.projectId)
    .maybeSingle()
  if (policyError) throw new Error(`Unable to resolve project Agent Policy context: ${policyError.message}`)

  context.environment = projectPolicy?.environment === 'NON_PRODUCTION' ? 'NON_PRODUCTION' : 'PRODUCTION'
  context.policyVersion = String(projectPolicy?.policy_version ?? AGENT_POLICY_VERSION)
  return { profile, context }
}

export async function createAgentApprovalRequest(input: CreateAgentApprovalRequestInput) {
  const admin = createAdminClient()
  const { profile, context } = await resolveAuthoritativeApprovalContext(input)
  const requirement = approvalRequirement({
    environment: context.environment,
    materialProductionMutation: profile.materialProductionMutation,
    businessCriticality: context.businessCriticality,
    dataSensitivity: context.dataSensitivity,
    financialImpact: profile.financialImpact,
    productionScope: profile.productionScope,
    reversibility: profile.reversibility,
    computeCost: profile.computeCost,
  })
  const fingerprintInput: ExecutionFingerprintInput = {
    actionKey: profile.key,
    environment: context.environment,
    projectId: context.projectId,
    resourceIds: context.resourceIds,
    parameters: input.parameters,
    policyVersion: context.policyVersion,
    businessCriticality: context.businessCriticality,
    dataSensitivity: context.dataSensitivity,
    materialProductionMutation: profile.materialProductionMutation,
    financialImpact: profile.financialImpact,
    productionScope: profile.productionScope,
    reversibility: profile.reversibility,
    computeCost: profile.computeCost,
  }
  const executionFingerprint = createExecutionFingerprint(fingerprintInput)
  const fingerprintPayload = canonicalExecutionFingerprintPayload(fingerprintInput)
  const requestedAt = new Date()
  const slaDueAt = addBusinessDays(requestedAt, requirement.slaDays)
  const status = requirement.requiresBusinessApproval
    ? 'BUSINESS_PENDING'
    : requirement.requiresGovernanceApproval
      ? 'GOVERNANCE_PENDING'
      : 'READY_TO_EXECUTE'

  const { data, error } = await admin.schema('governance').from('agent_approval_requests').insert({
    project_id: context.projectId,
    requested_by: input.requestedBy,
    domain: context.domain,
    environment: context.environment,
    action_key: profile.key,
    target_type: context.targetType,
    target_id: context.targetId,
    risk_level: requirement.risk,
    business_criticality: context.businessCriticality,
    material_production_mutation: profile.materialProductionMutation,
    execution_fingerprint: executionFingerprint,
    fingerprint_payload: fingerprintPayload,
    policy_version: context.policyVersion,
    status,
    sla_due_at: slaDueAt.toISOString(),
    requires_business_approval: requirement.requiresBusinessApproval,
    requires_governance_approval: requirement.requiresGovernanceApproval,
  }).select('*').single()

  if (error || !data) throw new Error(`Unable to create agent approval request: ${error?.message ?? 'unknown error'}`)
  await enqueueApprovalNotifications(String(data.id), 'REQUESTED')
  return {
    approval: data,
    riskContext: {
      projectId: context.projectId,
      domain: context.domain,
      environment: context.environment,
      policyVersion: context.policyVersion,
      targetType: context.targetType,
      targetId: context.targetId,
      resourceIds: context.resourceIds,
      businessCriticality: context.businessCriticality,
      dataSensitivity: context.dataSensitivity,
      risk: requirement.risk,
    },
  }
}

export async function recordAgentApprovalDecision(input: {
  requestId: string
  approverUserId: string
  axis: ApprovalAxis
  decision: ApprovalDecision
  comment: string
  channel: ApprovalChannel
}) {
  if (!input.comment.trim()) throw new Error('Approval comment is required.')
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').rpc('record_agent_approval_decision', {
    p_request_id: input.requestId,
    p_approver_user_id: input.approverUserId,
    p_axis: input.axis,
    p_decision: input.decision,
    p_comment: input.comment.trim(),
    p_channel: input.channel,
  })
  if (error) throw new Error(`Unable to record approval decision: ${error.message}`)
  await enqueueApprovalNotifications(input.requestId, 'DECIDED', { decision: input.decision, axis: input.axis, channel: input.channel })
  return data
}

export async function currentExecutionFingerprint(input: {
  requestId: string
  parameters: Record<string, unknown>
}) {
  const admin = createAdminClient()
  const { data: request, error } = await admin.schema('governance').from('agent_approval_requests')
    .select('*')
    .eq('id', input.requestId)
    .maybeSingle()
  if (error) throw new Error(`Unable to load approval request: ${error.message}`)
  if (!request) throw new Error('Approval request was not found.')

  const profile = getAgentActionProfile(String(request.action_key))
  const { data: projectPolicy, error: policyError } = await admin.schema('governance')
    .from('project_agent_policy_context')
    .select('environment,policy_version')
    .eq('project_id', request.project_id)
    .maybeSingle()
  if (policyError) throw new Error(`Unable to resolve project Agent Policy context: ${policyError.message}`)

  const environment = projectPolicy?.environment === 'NON_PRODUCTION' ? 'NON_PRODUCTION' : 'PRODUCTION'
  const policyVersion = String(projectPolicy?.policy_version ?? AGENT_POLICY_VERSION)

  if (String(request.target_type) !== 'DATASET') {
    const riskContext = await resolveProjectRiskContext(String(request.project_id))
    return createExecutionFingerprint({
      actionKey: profile.key,
      environment,
      projectId: riskContext.projectId,
      resourceIds: riskContext.resourceIds,
      parameters: input.parameters,
      policyVersion,
      businessCriticality: riskContext.businessCriticality,
      dataSensitivity: riskContext.dataSensitivity,
      materialProductionMutation: profile.materialProductionMutation,
      financialImpact: profile.financialImpact,
      productionScope: profile.productionScope,
      reversibility: profile.reversibility,
      computeCost: profile.computeCost,
    })
  }

  const datasetId = String(request.target_id)
  const riskContext = await resolveDatasetRiskContext(datasetId)
  if (riskContext.projectId !== String(request.project_id)) {
    throw new Error('Approval request resource no longer belongs to the approved project.')
  }

  return createExecutionFingerprint({
    actionKey: profile.key,
    environment,
    projectId: riskContext.projectId,
    resourceIds: [datasetId],
    parameters: input.parameters,
    policyVersion,
    businessCriticality: riskContext.businessCriticality,
    dataSensitivity: riskContext.dataSensitivity,
    materialProductionMutation: profile.materialProductionMutation,
    financialImpact: profile.financialImpact,
    productionScope: profile.productionScope,
    reversibility: profile.reversibility,
    computeCost: profile.computeCost,
  })
}

export async function validateApprovalForExecution(input: {
  requestId: string
  executorUserId: string
  currentFingerprint: string
}) {
  const admin = createAdminClient()
  const { data: request, error } = await admin.schema('governance').from('agent_approval_requests')
    .select('*')
    .eq('id', input.requestId)
    .maybeSingle()
  if (error) throw new Error(`Unable to load approval request: ${error.message}`)
  if (!request) throw new Error('Approval request was not found.')

  if (request.execution_fingerprint !== input.currentFingerprint) {
    await admin.schema('governance').from('agent_approval_requests').update({
      status: 'INVALIDATED',
      invalidated_at: new Date().toISOString(),
      invalidation_reason: 'Execution fingerprint changed after request/approval.',
      updated_at: new Date().toISOString(),
    }).eq('id', input.requestId)
    throw new Error('The execution request was invalidated because the governed execution context changed.')
  }

  if (request.status !== 'READY_TO_EXECUTE') {
    throw new Error(`Execution request is not ready. Current status: ${request.status}.`)
  }

  const profile = getAgentActionProfile(String(request.action_key))
  if (String(request.target_type) === 'DATASET') {
    await authorizeDataset(input.executorUserId, String(request.target_id), profile.capability)
  } else {
    await authorizeProject(input.executorUserId, String(request.project_id), profile.capability)
  }

  return request
}

export async function markApprovalExecuted(requestId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('agent_approval_requests').update({
    status: 'EXECUTED',
    executed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', requestId).eq('status', 'READY_TO_EXECUTE').select('*').maybeSingle()
  if (error) throw new Error(`Unable to mark approval executed: ${error.message}`)
  if (!data) throw new Error('Approval request was not READY_TO_EXECUTE.')
  return data
}

export async function createApprovalDelegation(input: {
  delegatorUserId: string
  delegateUserId: string
  createdBy: string
  axis: ApprovalAxis
  domain: string
  projectId?: string | null
  actionKeys?: readonly string[]
  maxRisk: RiskLevel
  startsAt: string
  endsAt?: string | null
  reason: string
}) {
  if (input.delegatorUserId === input.delegateUserId) throw new Error('A user cannot delegate approval authority to themselves.')
  if (!input.reason.trim()) throw new Error('Delegation reason is required.')

  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').from('agent_approval_delegations').insert({
    delegator_user_id: input.delegatorUserId,
    delegate_user_id: input.delegateUserId,
    created_by: input.createdBy,
    approval_axis: input.axis,
    domain: input.domain,
    project_id: input.projectId ?? null,
    action_keys: [...(input.actionKeys ?? [])],
    max_risk: input.maxRisk,
    starts_at: input.startsAt,
    ends_at: input.endsAt ?? null,
    reason: input.reason.trim(),
  }).select('*').single()
  if (error || !data) throw new Error(`Unable to create approval delegation: ${error?.message ?? 'unknown error'}`)
  return data
}
