import type { ProjectionEventEnvelope, TenantScope } from '@/lib/data-plane/contracts'
import { getProjectionCheckpointStore } from '@/lib/data-plane/projection-checkpoint-store'
import { getProjectionEventSource } from '@/lib/data-plane/projection-event-source'
import { recordProjectionDeadLetter, resolveProjectionDeadLetter } from '@/lib/data-plane/projection-dead-letter-store'

type ProjectionBatchOptions = TenantScope & {
  consumerKey: string
  providerKey: string
  projectionName: string
  limit?: number
  handle: (events: ProjectionEventEnvelope[]) => Promise<void>
}

function lagSeconds(occurredAt: string | undefined) {
  if (!occurredAt) return 0
  const timestamp = Date.parse(occurredAt)
  if (!Number.isFinite(timestamp)) return null
  return Math.max(0, Math.floor((Date.now() - timestamp) / 1000))
}

function maxFailureAttempts() {
  const parsed = Number.parseInt(process.env.PROJECTION_MAX_FAILURE_ATTEMPTS ?? '', 10)
  if (!Number.isFinite(parsed)) return 5
  return Math.max(2, Math.min(20, parsed))
}

export async function runProjectionBatch(options: ProjectionBatchOptions) {
  const scope = { projectId: options.projectId, organizationId: options.organizationId }
  const checkpoints = getProjectionCheckpointStore()
  const existing = await checkpoints.read(scope, options.consumerKey)
  if (existing?.status === 'PAUSED') {
    return { processed: 0, checkpoint: existing.lastCheckpoint, paused: true }
  }

  const source = getProjectionEventSource()
  const events = await source.read(scope, existing?.lastCheckpoint ?? null, options.limit)
  const now = new Date().toISOString()

  if (!events.length) {
    await checkpoints.write({
      ...scope,
      consumerKey: options.consumerKey,
      providerKey: options.providerKey,
      projectionName: options.projectionName,
      lastCheckpoint: existing?.lastCheckpoint ?? null,
      lastEventId: existing?.lastEventId ?? null,
      lastSuccessAt: now,
      lagSeconds: 0,
      lastError: null,
      status: 'HEALTHY',
      metadata: existing?.metadata ?? {},
    })
    return { processed: 0, checkpoint: existing?.lastCheckpoint ?? null, paused: false }
  }

  try {
    await options.handle(events)
    const first = events[0]!
    const last = events.at(-1)!
    await resolveProjectionDeadLetter(scope, options.consumerKey, first.event.eventId)
    await checkpoints.write({
      ...scope,
      consumerKey: options.consumerKey,
      providerKey: options.providerKey,
      projectionName: options.projectionName,
      lastCheckpoint: last.sequence,
      lastEventId: last.event.eventId,
      lastSuccessAt: now,
      lagSeconds: lagSeconds(last.event.occurredAt),
      lastError: null,
      status: 'HEALTHY',
      metadata: {
        ...(existing?.metadata ?? {}),
        lastBatchSize: events.length,
        failureAttempts: 0,
        deadLetterEventId: null,
      },
    })
    return { processed: events.length, checkpoint: last.sequence, paused: false }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 4000) : 'Projection batch failed'
    const first = events[0]!
    const last = events.at(-1)!
    const deadLetter = await recordProjectionDeadLetter({
      ...scope,
      consumerKey: options.consumerKey,
      providerKey: options.providerKey,
      projectionName: options.projectionName,
      envelope: first,
      error: message,
      metadata: {
        batchSize: events.length,
        firstSequence: first.sequence,
        lastSequence: last.sequence,
      },
    })
    const paused = deadLetter.attempts >= maxFailureAttempts()

    await checkpoints.write({
      ...scope,
      consumerKey: options.consumerKey,
      providerKey: options.providerKey,
      projectionName: options.projectionName,
      lastCheckpoint: existing?.lastCheckpoint ?? null,
      lastEventId: existing?.lastEventId ?? null,
      lastSuccessAt: existing?.lastSuccessAt ?? null,
      lagSeconds: lagSeconds(first.event.occurredAt),
      lastError: message,
      status: paused ? 'PAUSED' : 'FAILED',
      metadata: {
        ...(existing?.metadata ?? {}),
        failureAttempts: deadLetter.attempts,
        deadLetterEventId: first.event.eventId,
        failedBatchSize: events.length,
        failedFirstSequence: first.sequence,
        failedLastSequence: last.sequence,
      },
    })
    throw error
  }
}
