import type { AnalyticsEvent, AnalyticsEventProvider } from '@/lib/data-plane/contracts'
import { createAdminClient } from '@/lib/supabase/admin'

export class PostgresAnalyticsEventProvider implements AnalyticsEventProvider {
  readonly providerKey = 'postgres'

  async publish(events: AnalyticsEvent[]): Promise<void> {
    if (!events.length) return

    const rows = events.map((event) => ({
      event_id: event.eventId,
      project_id: event.projectId,
      schema_version: event.schemaVersion,
      event_type: event.eventType,
      occurred_at: event.occurredAt,
      aggregate_type: event.aggregateType,
      aggregate_id: event.aggregateId,
      aggregate_version: event.aggregateVersion == null ? null : String(event.aggregateVersion),
      correlation_id: event.correlationId ?? null,
      causation_id: event.causationId ?? null,
      actor_type: event.actorType ?? null,
      actor_id: event.actorId ?? null,
      payload: event.payload ?? {},
    }))

    const admin = createAdminClient()
    const { error } = await admin
      .schema('orchestration')
      .from('analytics_events')
      .upsert(rows, { onConflict: 'event_id', ignoreDuplicates: true })

    if (error) throw new Error(`Unable to persist PostgreSQL analytics events: ${error.message}`)
  }
}
