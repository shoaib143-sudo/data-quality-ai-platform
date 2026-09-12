import { createAdminClient } from '@/lib/supabase/admin'

export class IssueReferenceIntegrityError extends Error {
  status: number
  code: string

  constructor(message: string, code = 'ISSUE_REFERENCE_INTEGRITY', status = 400) {
    super(message)
    this.name = 'IssueReferenceIntegrityError'
    this.code = code
    this.status = status
  }
}

function id(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

async function datasetForVersion(versionId: string): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('catalog').from('dataset_versions')
    .select('dataset_id').eq('id', versionId).maybeSingle()
  if (error) throw new IssueReferenceIntegrityError(`Unable to validate dataset version: ${error.message}`)
  if (!data) throw new IssueReferenceIntegrityError('Dataset version does not exist.', 'ISSUE_DATASET_VERSION_NOT_FOUND', 404)
  return String(data.dataset_id)
}

async function versionForRun(runId: string): Promise<string> {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('profiling').from('profile_runs')
    .select('dataset_version_id').eq('id', runId).maybeSingle()
  if (error) throw new IssueReferenceIntegrityError(`Unable to validate profile run: ${error.message}`)
  if (!data) throw new IssueReferenceIntegrityError('Profile run does not exist.', 'ISSUE_PROFILE_RUN_NOT_FOUND', 404)
  return String(data.dataset_version_id)
}

async function assertDatasetInProject(datasetId: string, projectId: string): Promise<void> {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('catalog').from('datasets')
    .select('id').eq('id', datasetId).eq('project_id', projectId).maybeSingle()
  if (error) throw new IssueReferenceIntegrityError(`Unable to validate dataset project boundary: ${error.message}`)
  if (!data) throw new IssueReferenceIntegrityError('Dataset does not belong to the authorized project.', 'ISSUE_DATASET_PROJECT_MISMATCH')
}

export async function assertIssueReferencesBelongToProject(input: {
  projectId: string
  datasetId?: unknown
  datasetVersionId?: unknown
  profileRunId?: unknown
  findingId?: unknown
  qualityRuleRunId?: unknown
  controlFindingId?: unknown
}): Promise<void> {
  const datasetId = id(input.datasetId)
  const datasetVersionId = id(input.datasetVersionId)
  const profileRunId = id(input.profileRunId)
  const findingId = id(input.findingId)
  const qualityRuleRunId = id(input.qualityRuleRunId)
  const controlFindingId = id(input.controlFindingId)

  if (datasetId) await assertDatasetInProject(datasetId, input.projectId)

  let resolvedVersionId = datasetVersionId
  if (datasetVersionId) {
    const resolvedDatasetId = await datasetForVersion(datasetVersionId)
    await assertDatasetInProject(resolvedDatasetId, input.projectId)
    if (datasetId && resolvedDatasetId !== datasetId) {
      throw new IssueReferenceIntegrityError('Dataset version does not belong to the supplied dataset.', 'ISSUE_DATASET_VERSION_MISMATCH')
    }
  }

  if (profileRunId) {
    const runVersionId = await versionForRun(profileRunId)
    const runDatasetId = await datasetForVersion(runVersionId)
    await assertDatasetInProject(runDatasetId, input.projectId)
    if (resolvedVersionId && runVersionId !== resolvedVersionId) {
      throw new IssueReferenceIntegrityError('Profile run does not belong to the supplied dataset version.', 'ISSUE_PROFILE_RUN_VERSION_MISMATCH')
    }
    if (datasetId && runDatasetId !== datasetId) {
      throw new IssueReferenceIntegrityError('Profile run does not belong to the supplied dataset.', 'ISSUE_PROFILE_RUN_DATASET_MISMATCH')
    }
    resolvedVersionId = resolvedVersionId ?? runVersionId
  }

  if (findingId) {
    const admin = createAdminClient()
    const { data, error } = await admin.schema('profiling').from('profile_findings')
      .select('profile_run_id').eq('id', findingId).maybeSingle()
    if (error) throw new IssueReferenceIntegrityError(`Unable to validate profiling finding: ${error.message}`)
    if (!data) throw new IssueReferenceIntegrityError('Profiling finding does not exist.', 'ISSUE_FINDING_NOT_FOUND', 404)
    const findingRunId = String(data.profile_run_id)
    if (profileRunId && findingRunId !== profileRunId) {
      throw new IssueReferenceIntegrityError('Finding does not belong to the supplied profile run.', 'ISSUE_FINDING_RUN_MISMATCH')
    }
    const findingVersionId = await versionForRun(findingRunId)
    const findingDatasetId = await datasetForVersion(findingVersionId)
    await assertDatasetInProject(findingDatasetId, input.projectId)
    if (resolvedVersionId && findingVersionId !== resolvedVersionId) {
      throw new IssueReferenceIntegrityError('Finding does not belong to the supplied dataset version.', 'ISSUE_FINDING_VERSION_MISMATCH')
    }
    if (datasetId && findingDatasetId !== datasetId) {
      throw new IssueReferenceIntegrityError('Finding does not belong to the supplied dataset.', 'ISSUE_FINDING_DATASET_MISMATCH')
    }
  }

  if (qualityRuleRunId) {
    const admin = createAdminClient()
    const { data, error } = await admin.schema('profiling').from('quality_rule_runs')
      .select('dataset_version_id,profile_run_id').eq('id', qualityRuleRunId).maybeSingle()
    if (error) throw new IssueReferenceIntegrityError(`Unable to validate quality rule run: ${error.message}`)
    if (!data) throw new IssueReferenceIntegrityError('Quality rule run does not exist.', 'ISSUE_QUALITY_RULE_RUN_NOT_FOUND', 404)
    const qualityVersionId = String(data.dataset_version_id)
    const qualityDatasetId = await datasetForVersion(qualityVersionId)
    await assertDatasetInProject(qualityDatasetId, input.projectId)
    if (resolvedVersionId && qualityVersionId !== resolvedVersionId) {
      throw new IssueReferenceIntegrityError('Quality rule run does not belong to the supplied dataset version.', 'ISSUE_QUALITY_RULE_VERSION_MISMATCH')
    }
    if (datasetId && qualityDatasetId !== datasetId) {
      throw new IssueReferenceIntegrityError('Quality rule run does not belong to the supplied dataset.', 'ISSUE_QUALITY_RULE_DATASET_MISMATCH')
    }
    if (profileRunId && data.profile_run_id && String(data.profile_run_id) !== profileRunId) {
      throw new IssueReferenceIntegrityError('Quality rule run does not belong to the supplied profile run.', 'ISSUE_QUALITY_RULE_PROFILE_RUN_MISMATCH')
    }
  }

  if (controlFindingId) {
    const admin = createAdminClient()
    const { data, error } = await admin.schema('governance').from('governance_findings')
      .select('id,project_id').eq('id', controlFindingId).maybeSingle()
    if (error) throw new IssueReferenceIntegrityError(`Unable to validate governance control finding: ${error.message}`)
    if (!data) throw new IssueReferenceIntegrityError('Governance control finding does not exist.', 'ISSUE_CONTROL_FINDING_NOT_FOUND', 404)
    if (String(data.project_id) !== input.projectId) {
      throw new IssueReferenceIntegrityError('Governance control finding does not belong to the authorized project.', 'ISSUE_CONTROL_FINDING_PROJECT_MISMATCH')
    }
  }
}

export async function assertIssueOwnerBelongsToProjectOrganization(projectId: string, ownerUserId: unknown): Promise<void> {
  const ownerId = id(ownerUserId)
  if (!ownerId) return

  const admin = createAdminClient()
  const { data: project, error: projectError } = await admin.schema('app').from('projects')
    .select('organization_id').eq('id', projectId).maybeSingle()
  if (projectError) throw new IssueReferenceIntegrityError(`Unable to validate project organization: ${projectError.message}`)
  if (!project) throw new IssueReferenceIntegrityError('Project does not exist.', 'ISSUE_PROJECT_NOT_FOUND', 404)

  const { data: member, error: memberError } = await admin.schema('app').from('organization_members')
    .select('user_id').eq('organization_id', project.organization_id).eq('user_id', ownerId).maybeSingle()
  if (memberError) throw new IssueReferenceIntegrityError(`Unable to validate issue owner: ${memberError.message}`)
  if (!member) throw new IssueReferenceIntegrityError('Issue owner must be a member of the project organization.', 'ISSUE_OWNER_ORGANIZATION_MISMATCH')
}
