import { createAdminClient } from '@/lib/supabase/admin'
import { AuthorizationError } from '@/lib/auth/authorize'
import { assertProjectBelongsToInstanceOrganization } from '@/lib/governance/instance-organization'

/**
 * Authorize a hands-free certification initiator.
 *
 * This deliberately checks the DATA_GOVERNANCE_ADMIN role itself rather than
 * a capability that may also be delegated to narrower roles. Starting an
 * unattended end-to-end certification run is a super-admin operation.
 */
export async function authorizeDataGovernanceAdmin(userId: string, projectId: string) {
  if (!userId || !projectId) throw new AuthorizationError('Authentication and project context are required.', 401)

  let projectContext: { projectId: string; organizationId: string }
  try {
    projectContext = await assertProjectBelongsToInstanceOrganization(projectId)
  } catch (error) {
    if (error instanceof Error && error.message.includes('was not found')) throw new AuthorizationError('Project was not found.', 404)
    throw error
  }

  const admin = createAdminClient()
  const { data: projects, error: projectsError } = await admin
    .schema('app')
    .from('projects')
    .select('id')
    .eq('organization_id', projectContext.organizationId)
  if (projectsError) throw new Error(`Unable to resolve Data Governance Admin project scope: ${projectsError.message}`)

  const projectIds = (projects ?? []).map(project => String(project.id))
  if (!projectIds.length) throw new AuthorizationError('Data Governance Admin access is required.')

  const { data: bindings, error: bindingsError } = await admin
    .schema('governance')
    .from('project_role_bindings')
    .select('project_id,expires_at')
    .eq('user_id', userId)
    .eq('role_key', 'DATA_GOVERNANCE_ADMIN')
    .eq('active', true)
    .in('project_id', projectIds)
  if (bindingsError) throw new Error(`Unable to resolve Data Governance Admin authority: ${bindingsError.message}`)

  const now = Date.now()
  const active = (bindings ?? []).some(binding => !binding.expires_at || new Date(binding.expires_at).getTime() > now)
  if (!active) throw new AuthorizationError('Data Governance Admin access is required.')

  return {
    projectId: projectContext.projectId,
    organizationId: projectContext.organizationId,
    roleKey: 'DATA_GOVERNANCE_ADMIN' as const,
  }
}
