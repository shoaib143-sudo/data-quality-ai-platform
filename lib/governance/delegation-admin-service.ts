import { hasProjectCapability } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { agentActionCatalog, getAgentActionProfile } from './agent-action-catalog'
import type { RiskLevel } from './agent-policy-v2'
import { assertProjectBelongsToInstanceOrganization, resolveInstanceOrganizationMembership } from './instance-organization'

const riskRank: Record<RiskLevel, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 }
type ApprovalAxis = 'BUSINESS' | 'GOVERNANCE'

async function managedProjectIds(userId: string, organizationId: string) {
  const admin = createAdminClient()
  const { data: projects, error } = await admin.schema('app').from('projects')
    .select('id,name')
    .eq('organization_id', organizationId)
    .order('name')
  if (error) throw new Error(`Unable to load governance-admin projects: ${error.message}`)

  const checks = await Promise.all((projects ?? []).map(async project => ({
    ...project,
    allowed: await hasProjectCapability(userId, String(project.id), 'admin.manage'),
  })))
  return checks.filter(project => project.allowed).map(({ allowed: _allowed, ...project }) => project)
}

async function loadManagedDomains(projectIds: string[]) {
  if (!projectIds.length) return [] as { projectId: string; domain: string }[]
  const admin = createAdminClient()
  const [datasetsResult, cdeResult] = await Promise.all([
    admin.schema('catalog').from('datasets').select('project_id,business_domain').in('project_id', projectIds),
    admin.schema('governance').from('critical_data_elements').select('project_id,domain').in('project_id', projectIds),
  ])
  if (datasetsResult.error) throw new Error(`Unable to load governed dataset domains: ${datasetsResult.error.message}`)
  if (cdeResult.error) throw new Error(`Unable to load governed CDE domains: ${cdeResult.error.message}`)

  const unique = new Map<string, { projectId: string; domain: string }>()
  for (const row of datasetsResult.data ?? []) {
    const projectId = String(row.project_id)
    const domain = String(row.business_domain ?? '').trim()
    if (domain) unique.set(`${projectId}:${domain.toLowerCase()}`, { projectId, domain })
  }
  for (const row of cdeResult.data ?? []) {
    const projectId = String(row.project_id)
    const domain = String(row.domain ?? '').trim()
    if (domain) unique.set(`${projectId}:${domain.toLowerCase()}`, { projectId, domain })
  }
  return [...unique.values()].sort((a, b) => a.projectId.localeCompare(b.projectId) || a.domain.localeCompare(b.domain))
}

export async function loadGovernanceAdminDelegationWorkspace(userId: string) {
  const admin = createAdminClient()
  const membership = await resolveInstanceOrganizationMembership(userId)
  const projects = await managedProjectIds(userId, membership.organizationId)
  const projectIds = projects.map(project => String(project.id))
  if (!projectIds.length) {
    return { managedProjects: [], managedDomains: [], authorities: [], delegations: [], members: [], actionKeys: Object.keys(agentActionCatalog) }
  }

  const now = new Date().toISOString()
  const [authoritiesResult, delegationsResult, membersResult, managedDomains] = await Promise.all([
    admin.schema('governance').from('agent_approval_authorities')
      .select('id,user_id,project_id,domain,approval_axis,source_role_key,action_keys,max_risk,starts_at,ends_at,reason')
      .eq('active', true)
      .lte('starts_at', now)
      .or(`ends_at.is.null,ends_at.gt.${now}`)
      .order('domain'),
    admin.schema('governance').from('agent_approval_delegations')
      .select('id,delegator_user_id,delegate_user_id,approval_axis,domain,project_id,action_keys,max_risk,starts_at,ends_at,active,reason,created_by,created_at,revoked_by,revoked_at')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false })
      .limit(200),
    admin.schema('app').from('organization_members')
      .select('user_id,role')
      .eq('organization_id', membership.organizationId),
    loadManagedDomains(projectIds),
  ])

  if (authoritiesResult.error) throw new Error(`Unable to load governance-admin approval authorities: ${authoritiesResult.error.message}`)
  if (delegationsResult.error) throw new Error(`Unable to load governance-admin delegations: ${delegationsResult.error.message}`)
  if (membersResult.error) throw new Error(`Unable to load governance-admin member directory: ${membersResult.error.message}`)

  const memberRows = membersResult.data ?? []
  const memberIds = new Set(memberRows.map(row => String(row.user_id)))
  const labels = new Map<string, string>()
  const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (usersError) throw new Error(`Unable to load governance-admin user directory: ${usersError.message}`)
  for (const user of usersData.users) {
    if (memberIds.has(user.id)) labels.set(user.id, user.email ?? user.id)
  }

  const projectSet = new Set(projectIds)
  const authorities = (authoritiesResult.data ?? [])
    .filter(row => !row.project_id || projectSet.has(String(row.project_id)))
    .map(row => ({
      ...row,
      user_label: labels.get(String(row.user_id)) ?? String(row.user_id),
    }))

  return {
    managedProjects: projects,
    managedDomains,
    authorities,
    delegations: (delegationsResult.data ?? []).map(row => ({
      ...row,
      canRevoke: row.active === true && !row.revoked_at && Boolean(row.project_id) && projectSet.has(String(row.project_id)),
    })),
    members: memberRows.map(row => ({
      userId: String(row.user_id),
      role: String(row.role ?? ''),
      label: labels.get(String(row.user_id)) ?? String(row.user_id),
    })),
    actionKeys: Object.keys(agentActionCatalog),
  }
}

export async function createGovernanceAdminApprovalAuthority(input: {
  adminUserId: string
  approverUserId: string
  projectId: string
  domain: string
  approvalAxis: ApprovalAxis
  actionKeys: readonly string[]
  maxRisk: RiskLevel
  startsAt?: string | null
  endsAt?: string | null
  reason: string
}) {
  if (!input.reason.trim()) throw new Error('Authority assignment reason is required.')
  if (!input.projectId.trim()) throw new Error('Direct approval authority assignment must be project scoped.')
  if (!input.approverUserId.trim()) throw new Error('An approver is required.')
  if (!input.domain.trim()) throw new Error('A governed project domain is required.')
  if (!['BUSINESS','GOVERNANCE'].includes(input.approvalAxis)) throw new Error('Approval axis is invalid.')
  if (!(input.maxRisk in riskRank)) throw new Error('Authority maximum risk is invalid.')
  if (input.adminUserId === input.approverUserId) throw new Error('Administrators cannot assign direct approval authority to themselves.')

  const actionKeys = [...new Set(input.actionKeys.map(value => String(value).trim()).filter(Boolean))]
  if (!actionKeys.length) throw new Error('Authority assignment must include at least one explicitly scoped action.')
  for (const actionKey of actionKeys) getAgentActionProfile(actionKey)

  const projectId = input.projectId.trim()
  const domain = input.domain.trim()
  await assertProjectBelongsToInstanceOrganization(projectId)
  if (!await hasProjectCapability(input.adminUserId, projectId, 'admin.manage')) {
    throw new Error('Data Governance Admin authority is required for this project.')
  }

  const admin = createAdminClient()
  const membership = await resolveInstanceOrganizationMembership(input.adminUserId)
  const { data: approverMembership, error: approverMembershipError } = await admin.schema('app').from('organization_members')
    .select('user_id')
    .eq('organization_id', membership.organizationId)
    .eq('user_id', input.approverUserId)
    .maybeSingle()
  if (approverMembershipError) throw new Error(`Unable to validate approver membership: ${approverMembershipError.message}`)
  if (!approverMembership) throw new Error('Approver must be an individual member of this DataNexus organization.')

  const managedDomains = await loadManagedDomains([projectId])
  if (!managedDomains.some(row => row.projectId === projectId && row.domain.toLowerCase() === domain.toLowerCase())) {
    throw new Error('Approval domain is not governed by this project.')
  }

  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date()
  const endsAt = input.endsAt ? new Date(input.endsAt) : null
  if (!Number.isFinite(startsAt.getTime())) throw new Error('Authority start time is invalid.')
  if (endsAt && !Number.isFinite(endsAt.getTime())) throw new Error('Authority end time is invalid.')
  if (endsAt && endsAt <= startsAt) throw new Error('Authority end time must be after its start time.')

  const { data, error } = await admin.schema('governance').rpc('assign_agent_approval_authority', {
    p_actor_user_id: input.adminUserId,
    p_subject_user_id: input.approverUserId,
    p_project_id: projectId,
    p_domain: domain,
    p_approval_axis: input.approvalAxis,
    p_action_keys: actionKeys,
    p_max_risk: input.maxRisk,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt?.toISOString() ?? null,
    p_reason: input.reason.trim(),
  })
  if (error || !data) throw new Error(`Unable to assign direct approval authority: ${error?.message ?? 'unknown error'}`)
  return data
}

export async function createGovernanceAdminApprovalDelegation(input: {
  adminUserId: string
  authorityId: string
  delegateUserId: string
  projectId: string
  actionKeys: readonly string[]
  maxRisk: RiskLevel
  startsAt?: string | null
  endsAt?: string | null
  reason: string
}) {
  if (!input.reason.trim()) throw new Error('Delegation reason is required.')
  if (!input.authorityId.trim()) throw new Error('A direct approval authority is required.')
  if (!input.projectId.trim()) throw new Error('Governance-admin delegation must be narrowed to a managed project.')
  if (!input.delegateUserId.trim()) throw new Error('A delegate is required.')
  if (!(input.maxRisk in riskRank)) throw new Error('Delegation maximum risk is invalid.')

  const actionKeys = [...new Set(input.actionKeys.map(value => String(value).trim()).filter(Boolean))]
  if (!actionKeys.length) throw new Error('Delegation must include at least one explicitly scoped action.')
  for (const actionKey of actionKeys) getAgentActionProfile(actionKey)

  const projectId = input.projectId.trim()
  await assertProjectBelongsToInstanceOrganization(projectId)
  if (!await hasProjectCapability(input.adminUserId, projectId, 'admin.manage')) {
    throw new Error('Data Governance Admin authority is required for this project.')
  }

  const admin = createAdminClient()
  const membership = await resolveInstanceOrganizationMembership(input.adminUserId)
  const { data: delegateMembership, error: delegateMembershipError } = await admin.schema('app').from('organization_members')
    .select('user_id')
    .eq('organization_id', membership.organizationId)
    .eq('user_id', input.delegateUserId)
    .maybeSingle()
  if (delegateMembershipError) throw new Error(`Unable to validate delegate membership: ${delegateMembershipError.message}`)
  if (!delegateMembership) throw new Error('Delegate must be an individual member of this DataNexus organization.')

  const { data: authority, error: authorityError } = await admin.schema('governance').from('agent_approval_authorities')
    .select('id,user_id,project_id,domain,approval_axis,action_keys,max_risk,active,starts_at,ends_at')
    .eq('id', input.authorityId)
    .eq('active', true)
    .maybeSingle()
  if (authorityError) throw new Error(`Unable to validate direct approval authority: ${authorityError.message}`)
  if (!authority) throw new Error('The selected direct approval authority is not active.')

  const authorityProjectId = authority.project_id ? String(authority.project_id) : null
  if (authorityProjectId && authorityProjectId !== projectId) {
    throw new Error('Delegation project scope cannot exceed the direct approval authority.')
  }
  if (String(authority.user_id) === input.delegateUserId) {
    throw new Error('A user cannot delegate approval authority to themselves.')
  }
  const authorityActionKeys = Array.isArray(authority.action_keys) ? authority.action_keys.map(String) : []
  if (actionKeys.some(actionKey => !authorityActionKeys.includes(actionKey))) {
    throw new Error('Delegation action scope cannot exceed the direct approval authority.')
  }
  const authorityMaxRisk = String(authority.max_risk) as RiskLevel
  if (!(authorityMaxRisk in riskRank) || riskRank[input.maxRisk] > riskRank[authorityMaxRisk]) {
    throw new Error('Delegation risk ceiling cannot exceed the direct approval authority.')
  }

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

  const { data, error } = await admin.schema('governance').from('agent_approval_delegations').insert({
    delegator_user_id: authority.user_id,
    delegate_user_id: input.delegateUserId,
    created_by: input.adminUserId,
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

export async function revokeGovernanceAdminApprovalDelegation(input: {
  adminUserId: string
  delegationId: string
}) {
  const admin = createAdminClient()
  const { data: delegation, error: loadError } = await admin.schema('governance').from('agent_approval_delegations')
    .select('id,project_id,active,revoked_at')
    .eq('id', input.delegationId)
    .maybeSingle()
  if (loadError) throw new Error(`Unable to load approval delegation: ${loadError.message}`)
  if (!delegation) throw new Error('Approval delegation was not found.')
  if (!delegation.project_id) throw new Error('Domain-wide delegation can only be revoked by its delegator.')
  if (!await hasProjectCapability(input.adminUserId, String(delegation.project_id), 'admin.manage')) {
    throw new Error('Data Governance Admin authority is required for this project.')
  }
  if (delegation.active !== true || delegation.revoked_at) throw new Error('Approval delegation is already inactive.')

  const { data, error } = await admin.schema('governance').from('agent_approval_delegations').update({
    active: false,
    revoked_by: input.adminUserId,
    revoked_at: new Date().toISOString(),
  }).eq('id', input.delegationId).eq('active', true).select('*').maybeSingle()
  if (error) throw new Error(`Unable to revoke approval delegation: ${error.message}`)
  if (!data) throw new Error('Approval delegation could not be revoked because it changed concurrently.')
  return data
}
