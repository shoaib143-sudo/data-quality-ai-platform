import { createAdminClient } from '@/lib/supabase/admin'

export type PgclRunLearningProvenance = {
  agentRunId: string
  projectId: string
  classification: 'PRODUCTION_ELIGIBLE' | 'SYNTHETIC_OR_TEST'
  productionEligible: boolean
  syntheticOrTestDetected: boolean
  reason: string
  recordedAt?: string
}

export async function recordPgclRunLearningProvenance(input: {
  projectId: string
  agentRunId: string
}): Promise<PgclRunLearningProvenance> {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('record_pgcl_run_learning_provenance', {
    p_project_id: input.projectId,
    p_agent_run_id: input.agentRunId,
  })

  if (error || !data) {
    throw new Error(
      `Unable to record PGCL production-learning provenance: ${error?.message ?? 'no provenance returned'}`,
    )
  }

  const row = data as Partial<PgclRunLearningProvenance>
  const result: PgclRunLearningProvenance = {
    agentRunId: String(row.agentRunId ?? ''),
    projectId: String(row.projectId ?? ''),
    classification: row.classification === 'PRODUCTION_ELIGIBLE'
      ? 'PRODUCTION_ELIGIBLE'
      : 'SYNTHETIC_OR_TEST',
    productionEligible: row.productionEligible === true,
    syntheticOrTestDetected: row.syntheticOrTestDetected === true,
    reason: String(row.reason ?? ''),
    ...(row.recordedAt ? { recordedAt: String(row.recordedAt) } : {}),
  }

  if (result.agentRunId !== input.agentRunId || result.projectId !== input.projectId) {
    throw new Error('PGCL production-learning provenance identity does not match the source run')
  }
  if (
    result.classification !== 'PRODUCTION_ELIGIBLE'
    || result.productionEligible !== true
    || result.syntheticOrTestDetected !== false
  ) {
    throw new Error(
      `PGCL source run is not eligible for production learning: ${result.reason || result.classification}`,
    )
  }

  return result
}
