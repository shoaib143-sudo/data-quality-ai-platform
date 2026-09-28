import { createAdminClient } from '@/lib/supabase/admin'

type ProspectiveSummaryRow = {
  agent_key: string
  agent_version: string
  run_mode: string
  sample_count: number | string
  effective_count: number | string
  ineffective_count: number | string
  partial_count: number | string
  other_count: number | string
  mean_effectiveness: number | string | null
  first_verified_at: string
  last_verified_at: string
}

/** Returns observed counts only. Missing agents and modes have no measured results. */
export async function listGovernedLearningProspectiveResults(projectId: string) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('agent').rpc('summarize_learning_prospective_outcomes', {
    p_project_id: projectId,
  })
  if (error) throw new Error(`Unable to read prospective learning outcomes: ${error.message}`)
  return ((data ?? []) as ProspectiveSummaryRow[]).map((row) => ({
    agentKey: String(row.agent_key),
    agentVersion: String(row.agent_version),
    runMode: String(row.run_mode),
    sampleCount: Number(row.sample_count),
    effectiveCount: Number(row.effective_count),
    ineffectiveCount: Number(row.ineffective_count),
    partialCount: Number(row.partial_count),
    otherCount: Number(row.other_count),
    meanEffectiveness: row.mean_effectiveness == null ? null : Number(row.mean_effectiveness),
    firstVerifiedAt: String(row.first_verified_at),
    lastVerifiedAt: String(row.last_verified_at),
  }))
}
