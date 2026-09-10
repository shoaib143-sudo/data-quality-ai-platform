import { createAdminClient } from '@/lib/supabase/admin'

export type InstanceOrganizationMembership = {
  organizationId: string
  organizationRole: string | null
}

export class InstanceOrganizationIntegrityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InstanceOrganizationIntegrityError'
  }
}

/**
 * DataNexus is deployed as one dedicated instance, database and infrastructure
 * stack per organization. The database must therefore contain exactly one
 * canonical organization. Organization membership never selects tenant context.
 */
export async function resolveInstanceOrganizationId(): Promise<string> {
  const admin = createAdminClient()
  const organizationsResult = await admin.schema('app').from('organizations')
    .select('id')
    .limit(2)

  if (organizationsResult.error) {
    throw new InstanceOrganizationIntegrityError(`Unable to resolve instance organization: ${organizationsResult.error.message}`)
  }

  const organizations = organizationsResult.data ?? []
  if (organizations.length !== 1) {
    throw new InstanceOrganizationIntegrityError(
      `Single-organization invariant violated: expected exactly one organization in this DataNexus database, found ${organizations.length === 2 ? 'at least 2' : organizations.length}.`,
    )
  }

  return String(organizations[0].id)
}

/**
 * Resolves the authenticated user's membership inside the one organization
 * owned by this DataNexus instance. Unexpected memberships are integrity
 * defects and fail closed. They are never treated as alternate tenant context.
 */
export async function resolveInstanceOrganizationMembership(userId: string): Promise<InstanceOrganizationMembership> {
  const organizationId = await resolveInstanceOrganizationId()
  const admin = createAdminClient()
  const membershipsResult = await admin.schema('app').from('organization_members')
    .select('organization_id,role')
    .eq('user_id', userId)

  if (membershipsResult.error) {
    throw new InstanceOrganizationIntegrityError(`Unable to resolve organization membership: ${membershipsResult.error.message}`)
  }

  const memberships = membershipsResult.data ?? []
  const unexpectedMemberships = memberships.filter(row => String(row.organization_id) !== organizationId)
  if (unexpectedMemberships.length > 0) {
    throw new InstanceOrganizationIntegrityError(
      `Single-organization invariant violated: user ${userId} has membership outside the instance organization.`,
    )
  }

  const instanceMemberships = memberships.filter(row => String(row.organization_id) === organizationId)
  if (instanceMemberships.length !== 1) {
    throw new InstanceOrganizationIntegrityError(
      `Instance organization access denied: expected exactly one membership for user ${userId}, found ${instanceMemberships.length}.`,
    )
  }

  const membership = instanceMemberships[0]
  return {
    organizationId,
    organizationRole: membership.role ? String(membership.role) : null,
  }
}

export async function assertInstanceOrganizationId(organizationId: string): Promise<void> {
  const instanceOrganizationId = await resolveInstanceOrganizationId()
  if (organizationId !== instanceOrganizationId) {
    throw new InstanceOrganizationIntegrityError(
      `Organization context rejected: ${organizationId} is not the organization owned by this DataNexus instance.`,
    )
  }
}

/**
 * Resolves a project only after proving that its organization is the canonical
 * organization owned by this DataNexus instance. This is the reusable boundary
 * for server-side project context, including authorization, search and AI flows.
 */
export async function assertProjectBelongsToInstanceOrganization(projectId: string): Promise<{ projectId: string; organizationId: string }> {
  if (!projectId) {
    throw new InstanceOrganizationIntegrityError('Project context is required.')
  }

  const admin = createAdminClient()
  const projectResult = await admin.schema('app').from('projects')
    .select('id,organization_id')
    .eq('id', projectId)
    .maybeSingle()

  if (projectResult.error) {
    throw new InstanceOrganizationIntegrityError(`Unable to resolve project organization context: ${projectResult.error.message}`)
  }
  if (!projectResult.data) {
    throw new InstanceOrganizationIntegrityError(`Project context rejected: project ${projectId} was not found.`)
  }

  const organizationId = String(projectResult.data.organization_id)
  await assertInstanceOrganizationId(organizationId)
  return { projectId: String(projectResult.data.id), organizationId }
}
