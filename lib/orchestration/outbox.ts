import { createAdminClient } from '@/lib/supabase/admin'
import { queueDataQualityAutomation } from '@/lib/data-quality/queue'
import { queueAlertNotifications } from '@/lib/observability/notifications'

export type OutboxEvent = {
  id: string
  project_id: string
  event_type: string
  aggregate_type: string
  aggregate_id: string | null
  correlation_id: string | null
  idempotency_key: string
  payload: Record<string, unknown>
  status: string
  attempts: number
  max_attempts: number
  available_at: string
  lease_owner: string | null
  lease_expires_at: string | null
}

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function claimOutboxEvents(workerId: string, limit = 20) {
  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').rpc('claim_events', {
    p_worker: workerId,
    p_limit: limit,
  })
  if (error) throw new Error(`Unable to claim governance events: ${error.message}`)
  return (data ?? []) as OutboxEvent[]
}

async function markDone(eventId: string) {
  const admin = createAdminClient()
  const { error } = await admin.schema('orchestration').from('event_outbox').update({
    status: 'DONE',
    processed_at: new Date().toISOString(),
    lease_owner: null,
    lease_expires_at: null,
    last_error: null,
  }).eq('id', eventId)
  if (error) throw new Error(`Unable to complete governance event: ${error.message}`)
}

async function markFailed(event: OutboxEvent, error: unknown) {
  const admin = createAdminClient()
  const exhausted = event.attempts >= event.max_attempts
  const backoffMinutes = Math.min(60, Math.max(1, 2 ** Math.max(0, event.attempts - 1)))
  const message = error instanceof Error ? error.message : 'Governance event processing failed.'
  const { error: updateError } = await admin.schema('orchestration').from('event_outbox').update({
    status: exhausted ? 'DEAD' : 'FAILED',
    available_at: exhausted ? event.available_at : new Date(Date.now() + backoffMinutes * 60_000).toISOString(),
    lease_owner: null,
    lease_expires_at: null,
    last_error: message,
    processed_at: exhausted ? new Date().toISOString() : null,
  }).eq('id', event.id)
  if (updateError) throw new Error(`Unable to persist governance event failure: ${updateError.message}`)
}

export async function processOutboxEvent(event: OutboxEvent) {
  const payload = event.payload ?? {}

  if (event.event_type === 'PROFILE_COMPLETED') {
    const profileRunId = text(payload.profile_run_id)
    const datasetVersionId = text(payload.dataset_version_id)
    const datasetId = text(payload.dataset_id)
    if (!profileRunId || !datasetVersionId || !datasetId) throw new Error('PROFILE_COMPLETED event payload is incomplete.')

    const admin = createAdminClient()
    const { data: profileRun, error: profileError } = await admin
      .schema('profiling')
      .from('profile_runs')
      .select('id,status,agent_run_id')
      .eq('id', profileRunId)
      .maybeSingle()
    if (profileError || !profileRun) throw new Error(`Unable to validate completed profile event: ${profileError?.message ?? 'run not found'}`)
    if (profileRun.status !== 'COMPLETED') throw new Error('PROFILE_COMPLETED event references a non-completed profiling run.')

    await queueDataQualityAutomation({
      projectId: event.project_id,
      datasetId,
      datasetVersionId,
      profileRunId,
      parentRunId: profileRun.agent_run_id,
      requestedByUser: false,
    })
    return
  }

  if (event.event_type === 'OBSERVABILITY_ALERT_OPENED') {
    const alertId = text(payload.alert_id) || event.aggregate_id || ''
    if (!alertId) throw new Error('OBSERVABILITY_ALERT_OPENED event payload is incomplete.')
    await queueAlertNotifications(alertId)
    return
  }

  if (['QUALITY_RULE_EVALUATED', 'DATASET_VERSION_CREATED'].includes(event.event_type)) {
    return
  }
}

export async function processOutboxEvents(events: OutboxEvent[]) {
  const results: Array<Record<string, unknown>> = []
  for (const event of events) {
    try {
      await processOutboxEvent(event)
      await markDone(event.id)
      results.push({ eventId: event.id, eventType: event.event_type, status: 'DONE' })
    } catch (error) {
      await markFailed(event, error)
      results.push({
        eventId: event.id,
        eventType: event.event_type,
        status: event.attempts >= event.max_attempts ? 'DEAD' : 'RETRY',
        error: error instanceof Error ? error.message : 'Governance event processing failed.',
      })
    }
  }
  return results
}
