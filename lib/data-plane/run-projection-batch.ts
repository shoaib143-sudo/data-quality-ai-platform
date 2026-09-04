import type { ProjectionEventEnvelope, TenantScope } from '@/lib/data-plane/contracts'
import { getProjectionCheckpointStore } from '@/lib/data-plane/projection-checkpoint-store'
import { getProjectionEventSource } from '@/lib/data-plane/projection-event-source'

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
    const last = events.at(-1)!
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
      },
    })
    return { processed: events.length, checkpoint: last.sequence, paused: false }
  } catch (error) {
    await checkpoints.write({
      ...scope,
      consumerKey: options.consumerKey,
      providerKey: options.providerKey,
      projectionName: options.projectionName,
      lastCheckpoint: existing?.lastCheckpoint ?? null,
      lastEventId: existing?.lastEventId ?? null,
      lastSuccessAt: existing?.lastSuccessAt ?? null,
      lagSeconds: existing?.lagSeconds ?? null,
      lastError: error instanceof Error ? error.message.slice(0, 4000) : 'Projection batch failed',
      status: 'FAILED',
      metadata: existing?.metadata ?? {},
    })
    throw error
  }
}
