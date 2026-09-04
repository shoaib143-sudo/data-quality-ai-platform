import type {
  ProjectionCheckpoint,
  ProjectionCheckpointStore,
  TenantScope,
} from '@/lib/data-plane/contracts'
import { createAdminClient } from '@/lib/supabase/admin'

type CheckpointRow = {
  project_id: string
  consumer_key: string
  provider_key: string
  projection_name: string
  last_checkpoint: string | null
  last_event_id: string | null
  last_success_at: string | null
  lag_seconds: number | null
  last_error: string | null
  status: ProjectionCheckpoint['status']
  metadata: Record<string, unknown> | null
}

function fromRow(row: CheckpointRow): ProjectionCheckpoint {
  return {
    projectId: row.project_id,
    consumerKey: row.consumer_key,
    providerKey: row.provider_key,
    projectionName: row.projection_name,
    lastCheckpoint: row.last_checkpoint,
    lastEventId: row.last_event_id,
    lastSuccessAt: row.last_success_at,
    lagSeconds: row.lag_seconds,
    lastError: row.last_error,
    status: row.status,
    metadata: row.metadata ?? {},
  }
}

export class PostgresProjectionCheckpointStore implements ProjectionCheckpointStore {
  async read(scope: TenantScope, consumerKey: string): Promise<ProjectionCheckpoint | null> {
    const admin = createAdminClient()
    const { data, error } = await admin
      .schema('orchestration')
      .from('projection_checkpoints')
      .select('project_id,consumer_key,provider_key,projection_name,last_checkpoint,last_event_id,last_success_at,lag_seconds,last_error,status,metadata')
      .eq('project_id', scope.projectId)
      .eq('consumer_key', consumerKey)
      .maybeSingle()

    if (error) throw new Error(`Unable to read projection checkpoint: ${error.message}`)
    return data ? fromRow(data as CheckpointRow) : null
  }

  async write(checkpoint: ProjectionCheckpoint): Promise<void> {
    const admin = createAdminClient()
    const { error } = await admin
      .schema('orchestration')
      .from('projection_checkpoints')
      .upsert({
        project_id: checkpoint.projectId,
        consumer_key: checkpoint.consumerKey,
        provider_key: checkpoint.providerKey,
        projection_name: checkpoint.projectionName,
        last_checkpoint: checkpoint.lastCheckpoint,
        last_event_id: checkpoint.lastEventId ?? null,
        last_success_at: checkpoint.lastSuccessAt,
        lag_seconds: checkpoint.lagSeconds,
        last_error: checkpoint.lastError,
        status: checkpoint.status,
        metadata: checkpoint.metadata ?? {},
        updated_at: new Date().toISOString(),
      }, { onConflict: 'project_id,consumer_key' })

    if (error) throw new Error(`Unable to write projection checkpoint: ${error.message}`)
  }
}
