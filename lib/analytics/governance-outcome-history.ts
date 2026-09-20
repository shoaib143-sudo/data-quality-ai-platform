import { createAdminClient } from '@/lib/supabase/admin'
import { aggregateGovernanceOutcomeHistory } from '@/lib/analytics/governance-history-contract'
export type { GovernanceOutcomeHistoryPoint } from '@/lib/analytics/governance-history-contract'
export { aggregateGovernanceOutcomeHistory } from '@/lib/analytics/governance-history-contract'

export async function loadGovernanceOutcomeHistory(input: {
  projectId: string
  from?: string | null
  to?: string | null
  limit?: number
}) {
  const limit = Number.isFinite(input.limit)
    ? Math.max(1, Math.min(2000, Math.trunc(input.limit as number)))
    : 1000
  const admin = createAdminClient()
  let query = admin.schema('governance').from('governance_outcome_reports')
    .select('created_at,report_payload')
    .eq('project_id', input.projectId)
    .order('created_at', { ascending: true })
    .limit(limit)

  if (input.from) query = query.gte('created_at', input.from)
  if (input.to) query = query.lte('created_at', input.to)

  const { data, error } = await query
  if (error) throw new Error(`Unable to load governance outcome history: ${error.message}`)

  const rows = (data ?? []).map((row) => ({
    createdAt: String(row.created_at),
    report: row.report_payload,
  }))

  return {
    projectId: input.projectId,
    from: input.from ?? null,
    to: input.to ?? null,
    rowsRead: rows.length,
    buckets: aggregateGovernanceOutcomeHistory(rows),
  }
}
