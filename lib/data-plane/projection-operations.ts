import { createAdminClient } from '@/lib/supabase/admin'
import { writeGovernanceAudit } from '@/lib/governance/audit'

export type ProjectionConsumerHealth = {
  projectId: string
  consumerKey: string
  providerKey: string
  projectionName: string
  checkpoint: number | null
  latestSequence: number
  pendingEvents: number
  unresolvedDeadLetters: number
  status: string
  lagSeconds: number | null
  lastSuccessAt: string | null
  lastError: string | null
}

function numeric(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export async function listProjectionConsumerHealth(projectId: string): Promise<ProjectionConsumerHealth[]> {
  const admin = createAdminClient()
  const [{ data: checkpoints, error: checkpointError }, { data: latest, error: latestError }, { data: deadLetters, error: deadLetterError }] = await Promise.all([
    admin
      .schema('orchestration')
      .from('projection_checkpoints')
      .select('consumer_key,provider_key,projection_name,last_checkpoint,last_success_at,lag_seconds,last_error,status')
      .eq('project_id', projectId)
      .order('consumer_key'),
    admin
      .schema('orchestration')
      .from('projection_outbox')
      .select('sequence_id')
      .eq('project_id', projectId)
      .order('sequence_id', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .schema('orchestration')
      .from('projection_dead_letters')
      .select('consumer_key')
      .eq('project_id', projectId)
      .is('resolved_at', null),
  ])
  if (checkpointError) throw new Error(`Unable to read projection checkpoints: ${checkpointError.message}`)
  if (latestError) throw new Error(`Unable to read projection outbox: ${latestError.message}`)
  if (deadLetterError) throw new Error(`Unable to read projection dead letters: ${deadLetterError.message}`)

  const latestSequence = numeric(latest?.sequence_id)
  const deadLetterCounts = new Map<string, number>()
  for (const row of deadLetters ?? []) {
    const key = String(row.consumer_key)
    deadLetterCounts.set(key, (deadLetterCounts.get(key) ?? 0) + 1)
  }

  return (checkpoints ?? []).map((row) => {
    const checkpoint = row.last_checkpoint === null ? null : numeric(row.last_checkpoint)
    return {
      projectId,
      consumerKey: String(row.consumer_key),
      providerKey: String(row.provider_key),
      projectionName: String(row.projection_name),
      checkpoint,
      latestSequence,
      pendingEvents: Math.max(0, latestSequence - (checkpoint ?? 0)),
      unresolvedDeadLetters: deadLetterCounts.get(String(row.consumer_key)) ?? 0,
      status: String(row.status),
      lagSeconds: row.lag_seconds === null ? null : numeric(row.lag_seconds),
      lastSuccessAt: row.last_success_at ? String(row.last_success_at) : null,
      lastError: row.last_error ? String(row.last_error) : null,
    }
  })
}

export async function reconcileProjectionConsumer(input: {
  projectId: string
  consumerKey: string
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const consumers = await listProjectionConsumerHealth(input.projectId)
  const consumer = consumers.find((item) => item.consumerKey === input.consumerKey)
  if (!consumer) throw new Error(`Projection consumer ${input.consumerKey} was not found for this project.`)

  const structurallyValid = consumer.checkpoint === null || consumer.checkpoint <= consumer.latestSequence
  const now = new Date().toISOString()
  const { data, error } = await admin
    .schema('orchestration')
    .from('projection_reconciliation_runs')
    .insert({
      project_id: input.projectId,
      provider_key: consumer.providerKey,
      projection_name: consumer.projectionName,
      checkpoint: consumer.checkpoint === null ? null : String(consumer.checkpoint),
      status: structurallyValid ? 'PASSED' : 'FAILED',
      expected_count: consumer.latestSequence,
      actual_count: consumer.checkpoint ?? 0,
      mismatch_count: structurallyValid ? consumer.pendingEvents : Math.abs((consumer.checkpoint ?? 0) - consumer.latestSequence),
      started_at: now,
      completed_at: now,
      error: structurallyValid ? null : 'Checkpoint is ahead of the durable projection log.',
      details: {
        mode: 'CHECKPOINT_VS_OUTBOX',
        consumerKey: consumer.consumerKey,
        consumerStatus: consumer.status,
        pendingEvents: consumer.pendingEvents,
        unresolvedDeadLetters: consumer.unresolvedDeadLetters,
        lagSeconds: consumer.lagSeconds,
      },
    })
    .select('id,status,expected_count,actual_count,mismatch_count,details,completed_at')
    .single()
  if (error) throw new Error(`Unable to persist projection reconciliation: ${error.message}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? 'USER' : 'SYSTEM',
    eventType: 'PROJECTION_CONSUMER_RECONCILED',
    entityType: 'PROJECTION_CONSUMER',
    entityId: input.consumerKey,
    metadata: { reconciliation_id: data.id, ...consumer },
  })

  return { reconciliation: data, consumer }
}

export async function resetProjectionConsumer(input: {
  projectId: string
  consumerKey: string
  reason: string
  actorUserId?: string | null
}) {
  const reason = input.reason.trim()
  if (reason.length < 8) throw new Error('A rebuild/reset reason of at least 8 characters is required.')
  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .schema('orchestration')
    .from('projection_checkpoints')
    .select('consumer_key,provider_key,projection_name,last_checkpoint,last_event_id,status,metadata')
    .eq('project_id', input.projectId)
    .eq('consumer_key', input.consumerKey)
    .maybeSingle()
  if (readError) throw new Error(`Unable to read projection checkpoint: ${readError.message}`)
  if (!existing) throw new Error(`Projection consumer ${input.consumerKey} was not found for this project.`)

  const now = new Date().toISOString()
  const metadata = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
    ? existing.metadata as Record<string, unknown>
    : {}
  const { error: updateError } = await admin
    .schema('orchestration')
    .from('projection_checkpoints')
    .update({
      last_checkpoint: null,
      last_event_id: null,
      last_success_at: null,
      lag_seconds: null,
      last_error: null,
      status: 'UNKNOWN',
      metadata: {
        ...metadata,
        rebuildRequestedAt: now,
        rebuildReason: reason,
        previousCheckpoint: existing.last_checkpoint,
        previousStatus: existing.status,
      },
      updated_at: now,
    })
    .eq('project_id', input.projectId)
    .eq('consumer_key', input.consumerKey)
  if (updateError) throw new Error(`Unable to reset projection checkpoint: ${updateError.message}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? 'USER' : 'SYSTEM',
    eventType: 'PROJECTION_CONSUMER_RESET',
    entityType: 'PROJECTION_CONSUMER',
    entityId: input.consumerKey,
    metadata: {
      reason,
      provider_key: existing.provider_key,
      projection_name: existing.projection_name,
      previous_checkpoint: existing.last_checkpoint,
      previous_event_id: existing.last_event_id,
      previous_status: existing.status,
    },
  })

  return { consumerKey: input.consumerKey, status: 'UNKNOWN', checkpoint: null, reason }
}

export async function resumeProjectionConsumer(input: {
  projectId: string
  consumerKey: string
  actorUserId?: string | null
}) {
  const admin = createAdminClient()
  const { data: existing, error: readError } = await admin
    .schema('orchestration')
    .from('projection_checkpoints')
    .select('consumer_key,last_checkpoint,status,metadata')
    .eq('project_id', input.projectId)
    .eq('consumer_key', input.consumerKey)
    .maybeSingle()
  if (readError) throw new Error(`Unable to read projection checkpoint: ${readError.message}`)
  if (!existing) throw new Error(`Projection consumer ${input.consumerKey} was not found for this project.`)

  const now = new Date().toISOString()
  const metadata = existing.metadata && typeof existing.metadata === 'object' && !Array.isArray(existing.metadata)
    ? existing.metadata as Record<string, unknown>
    : {}
  const { error: updateError } = await admin
    .schema('orchestration')
    .from('projection_checkpoints')
    .update({
      status: existing.last_checkpoint === null ? 'UNKNOWN' : 'LAGGING',
      last_error: null,
      metadata: { ...metadata, resumedAt: now, failureAttempts: 0 },
      updated_at: now,
    })
    .eq('project_id', input.projectId)
    .eq('consumer_key', input.consumerKey)
  if (updateError) throw new Error(`Unable to resume projection consumer: ${updateError.message}`)

  await writeGovernanceAudit({
    projectId: input.projectId,
    actorUserId: input.actorUserId ?? null,
    actorType: input.actorUserId ? 'USER' : 'SYSTEM',
    eventType: 'PROJECTION_CONSUMER_RESUMED',
    entityType: 'PROJECTION_CONSUMER',
    entityId: input.consumerKey,
    metadata: { previous_status: existing.status, checkpoint: existing.last_checkpoint },
  })

  return { consumerKey: input.consumerKey, status: existing.last_checkpoint === null ? 'UNKNOWN' : 'LAGGING' }
}
