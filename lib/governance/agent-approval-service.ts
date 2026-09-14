import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeDataset, authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { canViewDatasetResource } from './resource-authorization'
import { assertProjectBelongsToInstanceOrganization, resolveInstanceOrganizationMembership } from './instance-organization'
import { authorizeAgentAction } from './agent-authorization'
import { agentActionCatalog, getAgentActionProfile } from './agent-action-catalog'
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

const riskRank: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }

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
    const datasetId = String(request.target_id)
    if (!await canViewDatasetResource(input.executorUserId, datasetId)) {
      throw new AuthorizationError('You are not authorized to access this dataset resource.')
    }
    await authorizeDataset(input.executorUserId, datasetId, profile.capability)
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

export async function loadApprovalDelegationWorkspace(userId: string) {
  const admin = createAdminClient()
  const membership = await resolveInstanceOrganizationMembership(userId)
  const now = new Date().toISOString()

  const [authoritiesResult, delegationsResult, projectsResult, membersResult] = await Promise.all([
    admin.schema('governance').from('agent_approval_authorities')
      .select('id,user_id,project_id,domain,approval_axis,source_role_key,starts_at,ends_at,reason')
      .eq('user_id', userId)
      .eq('active', true)
      .lte('starts_at', now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order('domain'),
    admin.schema('governance').from('agent_approval_delegations')
      .select('id,delegator_user_id,delegate_user_id,approval_axis,domain,project_id,action_keys,max_risk,starts_at,ends_at,active,reason,created_at,revoked_at')
      .or(`delegator_user_id.eq.${userId},delegate_user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(100),
    admin.schema('app').from('projects')
      .select('id,name')
      .eq('organization_id', membership.organizationId)
      .order('name'),
    admin.schema('app').from('organization_members')
      .select('user_id,role')
      .eq('organization_id', membership.organizationId),
  ])

  if (authoritiesResult.error) throw new Error(`Unable to load approval authorities: ${authoritiesResult.error.message}`)
  if (delegationsResult.error) throw new Error(`Unable to load approval delegations: ${delegationsResult.error.message}`)
  if (projectsResult.error) throw new Error(`Unable to load delegation projects: ${projectsResult.error.message}`)
  if (membersResult.error) throw new Error(`Unable to load organization members: ${membersResult.error.message}`)

  const memberRows = membersResult.data ?? []
  const memberIds = new Set(memberRows.map(row => String(row.user_id)))
  const memberDirectory = new Map<string, string>()
  if ((authoritiesResult.data ?? []).length > 0) {
    const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (usersError) throw new Error(`Unable to load delegation member directory: ${usersError.message}`)
    for (const user of usersData.users) {
      if (memberIds.has(user.id)) memberDirectory.set(user.id, user.email ?? user.id)
    }
  }

  return {
    authorities: authoritiesResult.data ?? [],
    delegations: (delegationsResult.data ?? []).map(row => ({
      ...row,
      canRevoke: String(row.delegator_user_id) === userId && row.active === true && !row.revoked_at,
    })),
    projects: projectsResult.data ?? [],
    members: (authoritiesResult.data ?? []).length > 0
      ? memberRows
          .filter(row => String(row.user_id) !== userId)
          .map(row => ({
            userId: String(row.user_id),
            role: String(row.role ?? ''),
            label: memberDirectory.get(String(row.user_id)) ?? String(row.user_id),
          }))
      : [],
    actionKeys: Object.keys(agentActionCatalog),
  }
}

export async function createApprovalDelegation(input: {
  delegatorUserId: string
  delegateUserId: string
  authorityId: string
  projectId?: string | null
  actionKeys: readonly string[]
  maxRisk: RiskLevel
  startsAt?: string | null
  endsAt?: string | null
  reason: string
}) {
  if (input.delegatorUserId === input.delegateUserId) throw new Error('A user cannot delegate approval authority to themselves.')
  if (!input.reason.trim()) throw new Error('Delegation reason is required.')
  if (!input.authorityId.trim()) throw new Error('A direct approval authority is required.')
  if (!input.actionKeys.length) throw new Error('Delegation must include at least one explicitly scoped action.')
  if (!(input.maxRisk in riskRank)) throw new Error('Delegation maximum risk is invalid.')

  const actionKeys = [...new Set(input.actionKeys.map(value => String(value).trim()).filter(Boolean))]
  if (!actionKeys.length) throw new Error('Delegation must include at least one explicitly scoped action.')
  for (const actionKey of actionKeys) getAgentActionProfile(actionKey)

  const admin = createAdminClient()
  const membership = await resolveInstanceOrganizationMembership(input.delegatorUserId)
  const { data: delegateMembership, error: delegateMembershipError } = await admin.schema('app').from('organization_members')
    .select('user_id')
    .eq('organization_id', membership.organizationId)
    .eq('user_id', input.delegateUserId)
    .maybeSingle()
  if (delegateMembershipError) throw new Error(`Unable to validate delegate membership: ${delegateMembershipError.message}`)
  if (!delegateMembership) throw new Error('Delegate must be an individual member of this DataNexus organization.')

  const { data: authority, error: authorityError } = await admin.schema('governance').from('agent_approval_authorities')
    .select('id,user_id,project_id,domain,approval_axis,active,starts_at,ends_at')
    .eq('id', input.authorityId)
    .eq('user_id', input.delegatorUserId)
    .eq('active', true)
    .maybeSingle()
  if (authorityError) throw new Error(`Unable to validate direct approval authority: ${authorityError.message}`)
  if (!authority) throw new Error('Only current direct approval authority can be delegated.')

  const now = new Date()
  const startsAt = input.startsAt ? new Date(input.startsAt) : now
  const endsAt = input.endsAt ? new Date(input.endsAt) : null
  const authorityStartsAt = new Date(authority.starts_at)
  const authorityEndsAt = authority.ends_at ? new Date(authority.ends_at) : null
  if (!Number.isFinite(startsAt.getTime())) throw new Error('Delegation start time is invalid.')
  if (startsAt < authorityStartsAt) throw new Error('Delegation cannot start before the direct authority begins.')
  if (authorityEndsAt && startsAt >= authorityEndsAt) throw new Error('The direct approval authority is no longer active for the requested delegation start time.')
  if (endsAt && !Number.isFinite(endsAt.getTime())) throw new Error('Delegation end time is invalid.')
  if (endsAt && endsAt <= startsAt) throw new Error('Delegation end time must be after its start time.')
  if (authorityEndsAt && !endsAt) throw new Error('A time-bound approval authority cannot create a permanent delegation.')
  if (authorityEndsAt && endsAt && endsAt > authorityEndsAt) throw new Error('Delegation cannot outlive the direct approval authority.')

  let projectId = input.projectId ? String(input.projectId).trim() : null
  const authorityProjectId = authority.project_id ? String(authority.project_id) : null
  if (authorityProjectId) {
    if (projectId && projectId !== authorityProjectId) throw new Error('Delegation project scope cannot exceed the direct approval authority.')
    projectId = authorityProjectId
  }
  if (projectId) await assertProjectBelongsToInstanceOrganization(projectId)

  const { data, error } = await admin.schema('governance').from('agent_approval_delegations').insert({
    delegator_user_id: input.delegatorUserId,
    delegate_user_id: input.delegateUserId,
    created_by: input.delegatorUserId,
    approval_axis: authority.approval_axis,
    domain: authority.domain,
    project_id: projectId,
    action_keys: actionKeys,
    max_risk: input.maxRisk,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt?.toISOString() ?? null,
    reason: input.reason.trim(),
  }).select('*').single()
  if (error || !data) throw new Error(`Unable to create approval delegation: ${error?.message ?? 'unknown error'}`)
  return data
}

export async function revokeApprovalDelegation(input: {
  delegationId: string
  revokedBy: string
}) {
  const admin = createAdminClient()
  const { data: delegation, error: loadError } = await admin.schema('governance').from('agent_approval_delegations')
    .select('id,delegator_user_id,active,revoked_at')
    .eq('id', input.delegationId)
    .maybeSingle()
  if (loadError) throw new Error(`Unable to load approval delegation: ${loadError.message}`)
  if (!delegation) throw new Error('Approval delegation was not found.')
  if (String(delegation.delegator_user_id) !== input.revokedBy) throw new Error('Only the delegator can revoke this approval delegation.')
  if (delegation.active !== true || delegation.revoked_at) throw new Error('Approval delegation is already inactive.')

  const now = new Date().toISOString()
  const { data, error } = await admin.schema('governance').from('agent_approval_delegations').update({
    active: false,
    revoked_by: input.revokedBy,
    revoked_at: now,
  }).eq('id', input.delegationId).eq('active', true).select('*').maybeSingle()
  if (error) throw new Error(`Unable to revoke approval delegation: ${error.message}`)
  if (!data) throw new Error('Approval delegation could not be revoked because it changed concurrently.')
  return data
}
