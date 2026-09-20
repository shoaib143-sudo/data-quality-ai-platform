import { createAdminClient } from '@/lib/supabase/admin'

export type AuditHistoryBucket = {
  bucketStart: string
  actorType: string
  eventType: string
  entityType: string | null
  domain: string | null
  eventCount: number
}

export function normalizeAuditHistoryRows(rows: unknown[]): AuditHistoryBucket[] {
  return rows.flatMap((value) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return []
    const row = value as Record<string, unknown>
    const bucketStart = typeof row.bucket_start === 'string' ? row.bucket_start : ''
    const actorType = typeof row.actor_type === 'string' ? row.actor_type : ''
    const eventType = typeof row.event_type === 'string' ? row.event_type : ''
    const count = Number(row.event_count)
    if (!bucketStart || !actorType || !eventType || !Number.isFinite(count) || count < 0) return []
    return [{
      bucketStart,
      actorType,
      eventType,
      entityType: typeof row.entity_type === 'string' ? row.entity_type : null,
      domain: typeof row.domain === 'string' && row.domain.trim() ? row.domain.trim() : null,
      eventCount: count,
    }]
  })
}

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
