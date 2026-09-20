import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeAuditHistoryRows } from '@/lib/analytics/governance-history-contract'
export type { AuditHistoryBucket } from '@/lib/analytics/governance-history-contract'
export { normalizeAuditHistoryRows } from '@/lib/analytics/governance-history-contract'

export async function loadAuditEventHistory(input: {
  projectId: string
  from?: string | null
  to?: string | null
  actorType?: string | null
  eventPrefix?: string | null
  entityType?: string | null
  limit?: number
}) {
  const limit = Number.isFinite(input.limit)
    ? Math.max(1, Math.min(5000, Math.trunc(input.limit as number)))
    : 2000
  const admin = createAdminClient()
  const { data, error } = await admin.schema('governance').rpc('query_audit_event_analytics', {
    p_project_id: input.projectId,
    p_from: input.from ?? null,
    p_to: input.to ?? null,
    p_actor_type: input.actorType?.trim() || null,
    p_event_prefix: input.eventPrefix?.trim() || null,
    p_entity_type: input.entityType?.trim() || null,
    p_limit: limit,
  })
  if (error) throw new Error(`Unable to load audit event analytics: ${error.message}`)

  const buckets = normalizeAuditHistoryRows(data ?? [])
  return {
    projectId: input.projectId,
    from: input.from ?? null,
    to: input.to ?? null,
    actorType: input.actorType?.trim() || null,
    eventPrefix: input.eventPrefix?.trim() || null,
    entityType: input.entityType?.trim() || null,
    bucketCount: buckets.length,
    totalEvents: buckets.reduce((sum, row) => sum + row.eventCount, 0),
    buckets,
  }
}
