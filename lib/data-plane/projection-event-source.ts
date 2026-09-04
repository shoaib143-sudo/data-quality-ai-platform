import type { ProjectionEventSource } from '@/lib/data-plane/contracts'
import { PostgresProjectionEventSource } from '@/lib/data-plane/providers/postgres-projection-event-source'

let source: ProjectionEventSource | null = null

export function getProjectionEventSource(): ProjectionEventSource {
  source ??= new PostgresProjectionEventSource()
  return source
}
