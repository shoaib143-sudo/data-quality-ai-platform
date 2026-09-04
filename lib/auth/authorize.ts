import { createAdminClient } from '@/lib/supabase/admin'

export type AuthorizationCapability =
  | 'catalog.read'
  | 'catalog.update'
  | 'profiling.read'
  | 'profiling.execute'
  | 'source.manage'
  | 'schedule.manage'
  | 'notification.manage'
  | 'workflow.manage'
  | 'discovery.execute'
  | 'capacity.manage'
  | 'retention.manage'
  | 'report.export'
  | 'admin.manage'
  | 'agent.execute'
  | 'glossary.read'
  | 'glossary.manage'
  | 'lineage.read'
  | 'lineage.manage'
  | 'quality.read'
  | 'quality.manage'
  | 'quality.execute'
  | 'quality.exception.approve'
  | 'observability.read'
  | 'observability.manage'
  | 'issues.manage'
  | 'classification.review'
  | 'policy.approve'
  | 'certification.request'
  | 'certification.review'
  | 'stewardship.manage'
  | 'contract.manage'
  | 'contract.approve'
  | 'audit.read'

export class AuthorizationError extends Error {
  status: number
  constructor(message = 'Access denied.', status = 403) {
    super(message)
    this.name = 'AuthorizationError'
    this.status = status
  }
}

export type ProjectAuthorization = {
  projectId: string
  organizationId: string
  organizationRole: string | null
  capability: AuthorizationCapability
}

export async function authorizeProject(userId: string, projectId: string, capability: AuthorizationCapability): Promise<ProjectAuthorization> {
  if (!userId || !projectId) throw new AuthorizationError('Authentication and project context are required.', 401)
  const admin = createAdminClient()

  const { data: project, error: projectError } = await admin
    .schema('app')
    .from('projects')
    .select('id,organization_id')
    .eq('id', projectId)
    .maybeSingle()
  if (projectError) throw new Error(`Unable to resolve project authorization context: ${projectError.message}`)
  if (!project) throw new AuthorizationError('Project was not found.', 404)

  const [{ data: allowed, error: capabilityError }, { data: membership, error: membershipError }] = await Promise.all([
    admin.schema('governance').rpc('has_project_capability', {
      p_project_id: projectId,
      p_user_id: userId,
      p_capability: capability,
    }),
    admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', userId).maybeSingle(),
  ])
  if (capabilityError) throw new Error(`Unable to evaluate project capability: ${capabilityError.message}`)
  if (membershipError) throw new Error(`Unable to resolve organization membership: ${membershipError.message}`)
  if (allowed !== true) throw new AuthorizationError(`You do not have permission to perform ${capability} in this project.`)

  return {
    projectId,
    organizationId: project.organization_id,
    organizationRole: membership?.role ? String(membership.role) : null,
    capability,
  }
}

export async function authorizeDataset(userId: string, datasetId: string, capability: AuthorizationCapability) {
  const admin = createAdminClient()
  const { data: dataset, error } = await admin
    .schema('catalog')
    .from('datasets')
    .select('id,project_id,name,data_source_id,source_identifier')
    .eq('id', datasetId)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve dataset authorization context: ${error.message}`)
  if (!dataset) throw new AuthorizationError('Dataset was not found.', 404)
  const authorization = await authorizeProject(userId, dataset.project_id, capability)
  return { authorization, dataset }
}

export async function authorizeDatasetVersion(userId: string, datasetVersionId: string, capability: AuthorizationCapability) {
  const admin = createAdminClient()
  const { data: version, error: versionError } = await admin
    .schema('catalog')
    .from('dataset_versions')
    .select('id,dataset_id,version_number,status')
    .eq('id', datasetVersionId)
    .maybeSingle()
  if (versionError) throw new Error(`Unable to resolve dataset version authorization context: ${versionError.message}`)
  if (!version) throw new AuthorizationError('Dataset version was not found.', 404)
  const { authorization, dataset } = await authorizeDataset(userId, version.dataset_id, capability)
  return { authorization, dataset, version }
}

export async function authorizeOrganizationAdmin(userId: string, organizationId: string, ownerRequired = false) {
  const admin = createAdminClient()
  const { data: membership, error } = await admin
    .schema('app')
    .from('organization_members')
    .select('organization_id,user_id,role')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve organization authorization context: ${error.message}`)
  if (!membership) throw new AuthorizationError('Organization access denied.')
  const role = String(membership.role)
  if (ownerRequired ? role !== 'OWNER' : !['OWNER','ADMIN'].includes(role)) {
    throw new AuthorizationError(ownerRequired ? 'Organization OWNER access is required.' : 'Organization administrator access is required.')
  }
  return { membership, role }
}

export function authorizationErrorResponse(error: unknown) {
  if (error instanceof AuthorizationError) return { status: error.status, error: error.message }
  return null
}
