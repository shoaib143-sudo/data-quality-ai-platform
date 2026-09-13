import { createAdminClient } from '@/lib/supabase/admin'
import { hasProjectCapability } from '@/lib/auth/authorize'

export type ResourceScopedRun = {
  id: string
  project_id: string
  dataset_id: string | null
}

export async function canViewDatasetResource(userId: string, datasetId: string): Promise<boolean> {
  if (!userId || !datasetId) return false
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').rpc('can_view_dataset_resource', {
    p_user_id: userId,
    p_dataset_id: datasetId,
  })
  if (error) throw new Error(`Unable to evaluate dataset visibility: ${error.message}`)
  return data === true
}

export async function canViewExecutionRun(userId: string, run: ResourceScopedRun): Promise<boolean> {
  if (run.dataset_id) return canViewDatasetResource(userId, run.dataset_id)
  return hasProjectCapability(userId, run.project_id, 'execution.view')
}

export async function filterAuthorizedExecutionRuns<T extends ResourceScopedRun>(userId: string, runs: readonly T[]): Promise<T[]> {
  const decisions = await Promise.all(runs.map(async run => ({ run, allowed: await canViewExecutionRun(userId, run) })))
  return decisions.filter(item => item.allowed).map(item => item.run)
}


export type AuthorizedDatasetScope = {
  projectId: string
  authorizedDatasetIds: string[]
  projectDatasetCount: number
  fullProjectVisibility: boolean
}

export async function authorizedDatasetScopeForProject(userId: string, projectId: string): Promise<AuthorizedDatasetScope> {
  if (!userId || !projectId) {
    return { projectId, authorizedDatasetIds: [], projectDatasetCount: 0, fullProjectVisibility: false }
  }

  const admin = createAdminClient()
  const { data: datasets, error } = await admin.schema('catalog').from('datasets')
    .select('id')
    .eq('project_id', projectId)
  if (error) throw new Error(`Unable to resolve project dataset scope: ${error.message}`)

  const datasetIds = (datasets ?? []).map(row => String(row.id))
  const decisions = await Promise.all(datasetIds.map(async datasetId => ({
    datasetId,
    allowed: await canViewDatasetResource(userId, datasetId),
  })))
  const authorizedDatasetIds = decisions.filter(item => item.allowed).map(item => item.datasetId)

  return {
    projectId,
    authorizedDatasetIds,
    projectDatasetCount: datasetIds.length,
    fullProjectVisibility: authorizedDatasetIds.length === datasetIds.length,
  }
}
