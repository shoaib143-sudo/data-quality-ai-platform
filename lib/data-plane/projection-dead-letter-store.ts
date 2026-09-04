import type { ProjectionEventEnvelope, TenantScope } from '@/lib/data-plane/contracts'
import { createAdminClient } from '@/lib/supabase/admin'

type DeadLetterRecord = TenantScope & {
  consumerKey: string
  providerKey: string
  projectionName: string
  envelope: ProjectionEventEnvelope
  error: string
  metadata?: Record<string, unknown>
}

type DeadLetterRow = {
  id: string
  attempts: number
}

export async function recordProjectionDeadLetter(record: DeadLetterRecord) {
  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .schema('orchestration')
    .from('projection_dead_letters')
    .select('id,attempts')
    .eq('project_id', record.projectId)
    .eq('consumer_key', record.consumerKey)
    .eq('event_id', record.envelope.event.eventId)
    .maybeSingle()

  if (readError) throw new Error(`Unable to read projection dead letter: ${readError.message}`)
  const attempts = Math.max(1, Number((existing as DeadLetterRow | null)?.attempts ?? 0) + 1)
  const now = new Date().toISOString()
  const row = {
    project_id: record.projectId,
    consumer_key: record.consumerKey,
    provider_key: record.providerKey,
    projection_name: record.projectionName,
    sequence_id: Number(record.envelope.sequence),
    event_id: record.envelope.event.eventId,
    event_type: record.envelope.event.eventType,
    aggregate_type: record.envelope.event.aggregateType,
    aggregate_id: record.envelope.event.aggregateId,
    error: record.error.slice(0, 4000),
    attempts,
    last_failed_at: now,
    resolved_at: null,
    metadata: record.metadata ?? {},
  }

  const query = admin.schema('orchestration').from('projection_dead_letters')
  const { error } = existing
    ? await query.update(row).eq('id', (existing as DeadLetterRow).id)
    : await query.insert(row)

  if (error) throw new Error(`Unable to persist projection dead letter: ${error.message}`)
  return { attempts }
}

export async function resolveProjectionDeadLetter(scope: TenantScope, consumerKey: string, eventId: string) {
  const admin = createAdminClient()
  const { error } = await admin
    .schema('orchestration')
    .from('projection_dead_letters')
    .update({ resolved_at: new Date().toISOString() })
    .eq('project_id', scope.projectId)
    .eq('consumer_key', consumerKey)
    .eq('event_id', eventId)

  if (error) throw new Error(`Unable to resolve projection dead letter: ${error.message}`)
}
