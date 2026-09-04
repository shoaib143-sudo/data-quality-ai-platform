import type {
  ProjectionEvent,
  ProjectionEventEnvelope,
  ProjectionEventSource,
  TenantScope,
} from '@/lib/data-plane/contracts'
import { createAdminClient } from '@/lib/supabase/admin'

type ProjectionRow = {
  sequence_id: string | number
  event_id: string
  project_id: string
  organization_id: string | null
  schema_version: number
  operation: ProjectionEvent['operation']
  event_type: string
  occurred_at: string
  aggregate_type: string
  aggregate_id: string
  aggregate_version: string | null
  correlation_id: string | null
  causation_id: string | null
  actor_type: string | null
  actor_id: string | null
  payload: Record<string, unknown> | null
}

function boundedLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 100
  return Math.max(1, Math.min(500, Math.trunc(value as number)))
}

function validSequence(value: string | null | undefined) {
  if (!value) return '0'
  if (!/^\d+$/.test(value)) throw new Error('Projection checkpoint sequence must be a non-negative integer string')
  return value
}

function toEnvelope(row: ProjectionRow): ProjectionEventEnvelope {
  return {
    sequence: String(row.sequence_id),
    event: {
      projectId: row.project_id,
      organizationId: row.organization_id,
      eventId: row.event_id,
      schemaVersion: row.schema_version,
      operation: row.operation,
      eventType: row.event_type,
      occurredAt: row.occurred_at,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      aggregateVersion: row.aggregate_version,
      correlationId: row.correlation_id,
      causationId: row.causation_id,
      actorType: row.actor_type,
      actorId: row.actor_id,
      payload: row.payload ?? {},
    },
  }
}

export class PostgresProjectionEventSource implements ProjectionEventSource {
  async read(scope: TenantScope, afterSequence?: string | null, limit?: number): Promise<ProjectionEventEnvelope[]> {
    const admin = createAdminClient()
    const { data, error } = await admin
      .schema('orchestration')
      .from('projection_outbox')
      .select('sequence_id,event_id,project_id,organization_id,schema_version,operation,event_type,occurred_at,aggregate_type,aggregate_id,aggregate_version,correlation_id,causation_id,actor_type,actor_id,payload')
      .eq('project_id', scope.projectId)
      .gt('sequence_id', validSequence(afterSequence))
      .order('sequence_id', { ascending: true })
      .limit(boundedLimit(limit))

    if (error) throw new Error(`Unable to read projection outbox: ${error.message}`)
    return ((data ?? []) as ProjectionRow[]).map(toEnvelope)
  }
}
