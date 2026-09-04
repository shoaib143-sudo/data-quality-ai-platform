import type { ProjectionEvent, ProjectionPublisher } from '@/lib/data-plane/contracts'
import { createAdminClient } from '@/lib/supabase/admin'

function uuidOrNull(value: string | null | undefined) {
  if (!value) return null
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null
}

function outboxRow(event: ProjectionEvent) {
  return {
    project_id: event.projectId,
    event_type: `PROJECTION.${event.eventType}`,
    aggregate_type: event.aggregateType,
    aggregate_id: uuidOrNull(event.aggregateId),
    correlation_id: uuidOrNull(event.correlationId),
    idempotency_key: `projection:${event.eventId}`,
    payload: {
      eventId: event.eventId,
      schemaVersion: event.schemaVersion,
      operation: event.operation,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      aggregateType: event.aggregateType,
      aggregateId: event.aggregateId,
      aggregateVersion: event.aggregateVersion ?? null,
      correlationId: event.correlationId ?? null,
      causationId: event.causationId ?? null,
      actorType: event.actorType ?? null,
      actorId: event.actorId ?? null,
      organizationId: event.organizationId ?? null,
      data: event.payload ?? {},
    },
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
      .from('event_outbox')
      .upsert(events.map(outboxRow), {
        onConflict: 'project_id,idempotency_key',
        ignoreDuplicates: true,
      })

    if (error) throw new Error(`Unable to publish projection events: ${error.message}`)
  }
}
