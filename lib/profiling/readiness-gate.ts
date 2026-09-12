import { createAdminClient } from '@/lib/supabase/admin'

export type ProfileReadinessState = 'READY' | 'PARTIALLY_READY' | 'BLOCKED' | 'NOT_ASSESSED'

export type DatasetProfileReadiness = {
  state: ProfileReadinessState
  profiling_ready: boolean
  project_id: string
  dataset_id?: string
  dataset_version_id?: string
  source_id?: string
  source_type?: string
  readiness_policy?: string | null
  blockers?: Record<string, boolean>
  remediation?: Record<string, {
    root_cause?: string
    manual_action?: string
    ai_action?: string
    ai_remediation?: string
    approval_required?: boolean
  }>
  [key: string]: unknown
}

export class ProfileReadinessGateError extends Error {
  readonly code = 'PROFILE_READINESS_GATE_BLOCKED'
  readonly readiness: DatasetProfileReadiness

  constructor(readiness: DatasetProfileReadiness) {
    const blockerCodes = Object.keys(readiness.blockers ?? {})
    const firstRemediation = blockerCodes
      .map((code) => readiness.remediation?.[code])
      .find((item) => item?.root_cause)
    const reason = firstRemediation?.root_cause
      ?? (readiness.state === 'NOT_ASSESSED'
        ? 'Profiling readiness has not been assessed for this dataset version.'
        : 'The dataset version is not ready for profiling.')
    super(`${reason} [state=${readiness.state}; blockers=${blockerCodes.join(',') || 'none'}]`)
    this.name = 'ProfileReadinessGateError'
    this.readiness = readiness
  }
}

export async function getDatasetVersionProfileReadiness(
  projectId: string,
  datasetVersionId: string,
): Promise<DatasetProfileReadiness> {
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .schema('catalog')
    .rpc('verify_dataset_version_profile_readiness', {
      p_project_id: projectId,
      p_dataset_version_id: datasetVersionId,
    })

  if (error) {
    throw new Error(`Unable to verify profiling readiness: ${error.message}`)
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Unable to verify profiling readiness: verifier returned invalid evidence')
  }

  return data as DatasetProfileReadiness
}

export async function assertDatasetVersionProfileReady(
  projectId: string,
  datasetVersionId: string,
): Promise<DatasetProfileReadiness> {
  const readiness = await getDatasetVersionProfileReadiness(projectId, datasetVersionId)
  if (readiness.state !== 'READY' || readiness.profiling_ready !== true) {
    throw new ProfileReadinessGateError(readiness)
  }
  return readiness
}
