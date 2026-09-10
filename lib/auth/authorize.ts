import { createAdminClient } from '@/lib/supabase/admin'
import {
  assertInstanceOrganizationId,
  assertProjectBelongsToInstanceOrganization,
  resolveInstanceOrganizationMembership,
} from '@/lib/governance/instance-organization'

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

export async function hasProjectCapability(userId: string, projectId: string, capability: AuthorizationCapability): Promise<boolean> {
  if (!userId || !projectId) return false
  await assertProjectBelongsToInstanceOrganization(projectId)
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').rpc('has_project_capability', {
    p_project_id: projectId,
    p_user_id: userId,
    p_capability: capability,
  })
  if (error) throw new Error(`Unable to evaluate project capability: ${error.message}`)
  return data === true
}

export async function authorizeProject(userId: string, projectId: string, capability: AuthorizationCapability): Promise<ProjectAuthorization> {
  if (!userId || !projectId) throw new AuthorizationError('Authentication and project context are required.', 401)

  let projectContext: { projectId: string; organizationId: string }
  try {
    projectContext = await assertProjectBelongsToInstanceOrganization(projectId)
  } catch (error) {
    if (error instanceof Error && error.message.includes('was not found')) throw new AuthorizationError('Project was not found.', 404)
    throw error
  }

  const [allowed, membership] = await Promise.all([
    hasProjectCapability(userId, projectId, capability),
    resolveInstanceOrganizationMembership(userId),
  ])
  if (!allowed) throw new AuthorizationError(`You do not have permission to perform ${capability} in this project.`)

  return {
    projectId: projectContext.projectId,
    organizationId: projectContext.organizationId,
    organizationRole: membership.organizationRole,
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
  await assertInstanceOrganizationId(organizationId)
  const membership = await resolveInstanceOrganizationMembership(userId)
  const role = membership.organizationRole ?? ''
  if (ownerRequired ? role !== 'OWNER' : !['OWNER','ADMIN'].includes(role)) {
    throw new AuthorizationError(ownerRequired ? 'Organization OWNER access is required.' : 'Organization administrator access is required.')
  }
  return {
    membership: {
      organization_id: membership.organizationId,
      user_id: userId,
      role,
    },
    role,
  }
}

export function authorizationErrorResponse(error: unknown) {
  if (error instanceof AuthorizationError) return { status: error.status, error: error.message }
  return null
}
