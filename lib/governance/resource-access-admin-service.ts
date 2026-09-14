import { hasProjectCapability } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertProjectBelongsToInstanceOrganization, resolveInstanceOrganizationMembership } from './instance-organization'

type GrantEffect = 'ALLOW' | 'DENY'

async function managedProjects(userId: string, organizationId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('app').from('projects')
    .select('id,name')
    .eq('organization_id', organizationId)
    .order('name')
  if (error) throw new Error(`Unable to load resource-access projects: ${error.message}`)

  const checks = await Promise.all((data ?? []).map(async project => ({
    id: String(project.id),
    name: String(project.name),
    allowed: await hasProjectCapability(userId, String(project.id), 'admin.manage'),
  })))
  return checks.filter(project => project.allowed).map(({ allowed: _allowed, ...project }) => project)
}

export async function loadResourceAccessWorkspace(userId: string) {
  const admin = createAdminClient()
  const membership = await resolveInstanceOrganizationMembership(userId)
  const projects = await managedProjects(userId, membership.organizationId)
  const projectIds = projects.map(project => project.id)
  if (!projectIds.length) return { projects: [], datasets: [], members: [], grants: [] }

  const [datasetsResult, membersResult, grantsResult, usersResult] = await Promise.all([
    admin.schema('catalog').from('datasets')
      .select('id,project_id,name,owner_user_id')
      .in('project_id', projectIds)
      .order('name'),
    admin.schema('app').from('organization_members')
      .select('user_id,role')
      .eq('organization_id', membership.organizationId),
    admin.schema('governance').from('resource_access_grants')
      .select('id,project_id,resource_type,resource_id,user_id,effect,active,starts_at,ends_at,reason,created_by,created_at,revoked_by,revoked_at')
      .in('project_id', projectIds)
      .order('created_at', { ascending: false })
      .limit(250),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ])

  if (datasetsResult.error) throw new Error(`Unable to load resource-access datasets: ${datasetsResult.error.message}`)
  if (membersResult.error) throw new Error(`Unable to load resource-access members: ${membersResult.error.message}`)
  if (grantsResult.error) throw new Error(`Unable to load resource-access grants: ${grantsResult.error.message}`)
  if (usersResult.error) throw new Error(`Unable to load resource-access member directory: ${usersResult.error.message}`)

  const memberIds = new Set((membersResult.data ?? []).map(row => String(row.user_id)))
  const labels = new Map<string, string>()
  for (const user of usersResult.data.users) {
    if (memberIds.has(user.id)) labels.set(user.id, user.email ?? user.id)
  }

  return {
    projects,
    datasets: (datasetsResult.data ?? []).map(row => ({
      id: String(row.id),
      projectId: String(row.project_id),
      name: String(row.name),
      ownerUserId: row.owner_user_id ? String(row.owner_user_id) : null,
    })),
    members: (membersResult.data ?? []).map(row => ({
      userId: String(row.user_id),
      role: String(row.role ?? ''),
      label: labels.get(String(row.user_id)) ?? String(row.user_id),
    })),
    grants: (grantsResult.data ?? []).map(row => ({
      id: String(row.id),
      projectId: String(row.project_id),
      resourceType: String(row.resource_type),
      resourceId: String(row.resource_id),
      userId: String(row.user_id),
      effect: String(row.effect) as GrantEffect,
      active: row.active === true,
      startsAt: String(row.starts_at),
      endsAt: row.ends_at ? String(row.ends_at) : null,
      reason: String(row.reason),
      createdBy: String(row.created_by),
      createdAt: String(row.created_at),
      revokedBy: row.revoked_by ? String(row.revoked_by) : null,
      revokedAt: row.revoked_at ? String(row.revoked_at) : null,
      userLabel: labels.get(String(row.user_id)) ?? String(row.user_id),
    })),
  }
}

export async function createResourceAccessGrant(input: {
  actorUserId: string
  projectId: string
  datasetId: string
  targetUserId: string
  effect: GrantEffect
  startsAt?: string | null
  endsAt?: string | null
  reason: string
}) {
  if (!input.reason.trim()) throw new Error('A resource-access reason is required.')
  if (!['ALLOW', 'DENY'].includes(input.effect)) throw new Error('Resource-access effect must be ALLOW or DENY.')
  await assertProjectBelongsToInstanceOrganization(input.projectId)
  if (!await hasProjectCapability(input.actorUserId, input.projectId, 'admin.manage')) {
    throw new Error('Project administrator authority is required to manage resource access.')
  }

  const admin = createAdminClient()
  const membership = await resolveInstanceOrganizationMembership(input.actorUserId)
  const [{ data: dataset, error: datasetError }, { data: target, error: targetError }] = await Promise.all([
    admin.schema('catalog').from('datasets').select('id,project_id').eq('id', input.datasetId).maybeSingle(),
    admin.schema('app').from('organization_members')
      .select('user_id')
      .eq('organization_id', membership.organizationId)
      .eq('user_id', input.targetUserId)
      .maybeSingle(),
  ])
  if (datasetError) throw new Error(`Unable to validate resource dataset: ${datasetError.message}`)
  if (!dataset || String(dataset.project_id) !== input.projectId) throw new Error('Dataset does not belong to the managed project.')
  if (targetError) throw new Error(`Unable to validate resource-access member: ${targetError.message}`)
  if (!target) throw new Error('Resource-access target must be a member of this DataNexus organization.')

  const startsAt = input.startsAt ? new Date(input.startsAt) : new Date()
  const endsAt = input.endsAt ? new Date(input.endsAt) : null
  if (!Number.isFinite(startsAt.getTime())) throw new Error('Resource-access start time is invalid.')
  if (endsAt && !Number.isFinite(endsAt.getTime())) throw new Error('Resource-access end time is invalid.')
  if (endsAt && endsAt <= startsAt) throw new Error('Resource-access end time must be after its start time.')

  const now = new Date().toISOString()
  const { data: existing, error: existingError } = await admin.schema('governance').from('resource_access_grants')
    .select('id,effect')
    .eq('project_id', input.projectId)
    .eq('resource_type', 'DATASET')
    .eq('resource_id', input.datasetId)
    .eq('user_id', input.targetUserId)
    .eq('active', true)
    .lte('starts_at', now)
    .or(`ends_at.is.null,ends_at.gt.${now}`)
    .limit(1)
  if (existingError) throw new Error(`Unable to validate existing resource access: ${existingError.message}`)
  if (existing?.length) {
    throw new Error(`An active ${existing[0].effect} grant already exists for this person and dataset. Revoke it before replacing the rule.`)
  }

  const { data, error } = await admin.schema('governance').from('resource_access_grants').insert({
    project_id: input.projectId,
    resource_type: 'DATASET',
    resource_id: input.datasetId,
    user_id: input.targetUserId,
    effect: input.effect,
    active: true,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt?.toISOString() ?? null,
    reason: input.reason.trim(),
    created_by: input.actorUserId,
  }).select('*').single()
  if (error || !data) throw new Error(`Unable to create resource-access grant: ${error?.message ?? 'unknown error'}`)
  return data
}

export async function revokeResourceAccessGrant(input: { actorUserId: string; grantId: string }) {
  const admin = createAdminClient()
  const { data: grant, error: loadError } = await admin.schema('governance').from('resource_access_grants')
    .select('id,project_id,active,revoked_at')
    .eq('id', input.grantId)
    .maybeSingle()
  if (loadError) throw new Error(`Unable to load resource-access grant: ${loadError.message}`)
  if (!grant) throw new Error('Resource-access grant was not found.')
  if (!await hasProjectCapability(input.actorUserId, String(grant.project_id), 'admin.manage')) {
    throw new Error('Project administrator authority is required to revoke resource access.')
  }
  if (grant.active !== true || grant.revoked_at) throw new Error('Resource-access grant is already inactive.')

  const revokedAt = new Date().toISOString()
  const { data, error } = await admin.schema('governance').from('resource_access_grants').update({
    active: false,
    revoked_by: input.actorUserId,
    revoked_at: revokedAt,
  }).eq('id', input.grantId).eq('active', true).select('*').maybeSingle()
  if (error) throw new Error(`Unable to revoke resource-access grant: ${error.message}`)
  if (!data) throw new Error('Resource-access grant changed concurrently and could not be revoked.')
  return data
}
