import type { ProjectionPublisher } from '@/lib/data-plane/contracts'
import { PostgresOutboxProjectionPublisher } from '@/lib/data-plane/providers/postgres-outbox-projection-publisher'

let publisher: ProjectionPublisher | null = null

export function getProjectionPublisher(): ProjectionPublisher {
  publisher ??= new PostgresOutboxProjectionPublisher()
  return publisher
}
