import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeGovernanceOutcomeHistoryRows } from '@/lib/analytics/governance-history-contract'
export type { GovernanceOutcomeHistoryPoint } from '@/lib/analytics/governance-history-contract'
export { aggregateGovernanceOutcomeHistory, normalizeGovernanceOutcomeHistoryRows } from '@/lib/analytics/governance-history-contract'

export async function loadGovernanceOutcomeHistory(input: {
  projectId: string
  from?: string | null
  to?: string | null
  limit?: number
}) {
  const limit = Number.isFinite(input.limit)
    ? Math.max(1, Math.min(5000, Math.trunc(input.limit as number)))
    : 2000
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').rpc('query_governance_outcome_history', {
    p_project_id: input.projectId,
    p_from: input.from ?? null,
    p_to: input.to ?? null,
    p_limit: limit,
  })
  if (error) throw new Error(`Unable to load governance outcome history: ${error.message}`)

  const buckets = normalizeGovernanceOutcomeHistoryRows(data ?? [])
  return {
    projectId: input.projectId,
    from: input.from ?? null,
    to: input.to ?? null,
    rowsRead: buckets.reduce((sum, row) => sum + row.reportCount, 0),
    buckets,
  }
}
