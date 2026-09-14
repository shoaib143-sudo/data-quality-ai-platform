import { createAdminClient } from '@/lib/supabase/admin'
import { AuthorizationError } from '@/lib/auth/authorize'

export const DATA_GOVERNANCE_SUPER_ADMIN_ROLE = 'DATA_GOVERNANCE_ADMIN' as const

function activeBindingQuery(admin: ReturnType<typeof createAdminClient>, userId: string) {
  return admin
    .schema('governance')
    .from('project_role_bindings')
    .select('project_id,expires_at')
    .eq('user_id', userId)
    .eq('role_key', DATA_GOVERNANCE_SUPER_ADMIN_ROLE)
    .eq('active', true)
}

export async function dataGovernanceSuperAdminProjectIds(userId: string) {
  if (!userId) return []
  const admin = createAdminClient()
  const { data, error } = await activeBindingQuery(admin, userId)
  if (error) throw new Error(`Unable to resolve Data Governance Super Admin authority: ${error.message}`)
  const now = Date.now()
  return (data ?? [])
    .filter(binding => !binding.expires_at || new Date(binding.expires_at).getTime() > now)
    .map(binding => String(binding.project_id))
}

export async function dataGovernanceSuperAdminOrganizationIds(userId: string) {
  const projectIds = await dataGovernanceSuperAdminProjectIds(userId)
  if (!projectIds.length) return []
  const admin = createAdminClient()
  const { data, error } = await admin.schema('app').from('projects').select('organization_id').in('id', projectIds)
  if (error) throw new Error(`Unable to resolve Super Admin organization scope: ${error.message}`)
  return [...new Set((data ?? []).map(project => String(project.organization_id)))]
}

export async function authorizeDataGovernanceSuperAdmin(userId: string, projectId: string) {
  if (!userId || !projectId) throw new AuthorizationError('Authentication and project context are required.', 401)
  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin.schema('app').from('projects').select('id,organization_id,name').eq('id', projectId).maybeSingle()
  if (projectError) throw new Error(`Unable to resolve project context: ${projectError.message}`)
  if (!project) throw new AuthorizationError('Project was not found.', 404)

  const organizationIds = await dataGovernanceSuperAdminOrganizationIds(userId)
  if (!organizationIds.includes(String(project.organization_id))) {
    throw new AuthorizationError('Data Governance Admin Super Admin access is required.')
  }
  return { projectId: String(project.id), organizationId: String(project.organization_id), projectName: String(project.name) }
}

export async function authorizeDataGovernanceSuperAdminForOrganization(userId: string, organizationId: string) {
  if (!userId || !organizationId) throw new AuthorizationError('Authentication and organization context are required.', 401)
  const organizationIds = await dataGovernanceSuperAdminOrganizationIds(userId)
  if (!organizationIds.includes(organizationId)) {
    throw new AuthorizationError('Data Governance Admin Super Admin access is required.')
  }
  return { organizationId }
}

export async function isDataGovernanceSuperAdmin(userId: string) {
  return (await dataGovernanceSuperAdminOrganizationIds(userId)).length > 0
}
