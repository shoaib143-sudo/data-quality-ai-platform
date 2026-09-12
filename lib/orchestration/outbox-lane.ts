export type OutboxLaneDisposition =
  | 'PROCESSED'
  | 'CLAIM_FAILED_RETRY_LATER'
  | 'PROCESSING_FAILED_RETRY_BY_OUTBOX_POLICY'
  | 'SKIPPED_AFTER_DEGRADATION'

export type OutboxLaneResult = {
  degraded: boolean
  disposition: OutboxLaneDisposition
  claimed: number
  results: Array<Record<string, unknown>>
  error: string | null
}

type OutboxLaneDependencies<TEvent> = {
  claimEvents: (workerId: string, limit: number) => Promise<TEvent[]>
  processEvents: (events: TEvent[]) => Promise<Array<Record<string, unknown>>>
}

function boundedError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Governance event transport failed.'
  return message.slice(0, 500)
}

export async function runOutboxLane<TEvent>(
  workerId: string,
  limit: number,
  dependencies: OutboxLaneDependencies<TEvent>,
): Promise<OutboxLaneResult> {
  let events: TEvent[]
  try {
    events = await dependencies.claimEvents(workerId, limit)
  } catch (error) {
    return {
      degraded: true,
      disposition: 'CLAIM_FAILED_RETRY_LATER',
      claimed: 0,
      results: [],
      error: boundedError(error),
    }
  }

  try {
    const results = await dependencies.processEvents(events)
    return {
      degraded: false,
      disposition: 'PROCESSED',
      claimed: events.length,
      results,
      error: null,
    }
  } catch (error) {
    return {
      degraded: true,
      disposition: 'PROCESSING_FAILED_RETRY_BY_OUTBOX_POLICY',
      claimed: events.length,
      results: [],
      error: boundedError(error),
    }
  }
}

export function skippedOutboxLane(): OutboxLaneResult {
  return {
    degraded: true,
    disposition: 'SKIPPED_AFTER_DEGRADATION',
    claimed: 0,
    results: [],
    error: null,
  }
}
