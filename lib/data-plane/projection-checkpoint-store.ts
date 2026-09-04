import type { ProjectionCheckpointStore } from '@/lib/data-plane/contracts'
import { PostgresProjectionCheckpointStore } from '@/lib/data-plane/providers/postgres-projection-checkpoint-store'

let store: ProjectionCheckpointStore | null = null

export function getProjectionCheckpointStore(): ProjectionCheckpointStore {
  store ??= new PostgresProjectionCheckpointStore()
  return store
}
