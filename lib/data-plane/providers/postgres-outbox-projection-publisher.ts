import type { ProjectionEvent, ProjectionPublisher } from '@/lib/data-plane/contracts'
import { createAdminClient } from '@/lib/supabase/admin'

function outboxRow(event: ProjectionEvent) {
  return {
    event_id: event.eventId,
    project_id: event.projectId,
    organization_id: event.organizationId ?? null,
    schema_version: event.schemaVersion,
    operation: event.operation,
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
  }
}

export class PostgresOutboxProjectionPublisher implements ProjectionPublisher {
  async publish(event: ProjectionEvent): Promise<void> {
    await this.publishMany([event])
  }

  async publishMany(events: ProjectionEvent[]): Promise<void> {
    if (!events.length) return
    const admin = createAdminClient()
    const { error } = await admin
      .schema('orchestration')
      .from('projection_outbox')
      .upsert(events.map(outboxRow), {
        onConflict: 'event_id',
        ignoreDuplicates: true,
      })

    if (error) throw new Error(`Unable to publish projection events: ${error.message}`)
  }
}
