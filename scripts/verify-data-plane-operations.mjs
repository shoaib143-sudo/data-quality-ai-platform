import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing data-plane operations artifact: ${path}`)
  return fs.readFileSync(path, 'utf8')
}

function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (!source.includes(pattern)) throw new Error(`${path} is missing required data-plane operations contract: ${pattern}`)
  }
}

requireText('lib/data-plane/run-projection-batch.ts', [
  'recordProjectionDeadLetter',
  'maxFailureAttempts',
  "status: paused ? 'PAUSED' : 'FAILED'",
])

requireText('lib/data-plane/projection-operations.ts', [
  'listProjectionConsumerHealth',
  'reconcileProjectionConsumer',
  'resetProjectionConsumer',
  'resumeProjectionConsumer',
  'PROJECTION_CONSUMER_RECONCILED',
  'PROJECTION_CONSUMER_RESET',
  'PROJECTION_CONSUMER_RESUMED',
])

requireText('lib/data-plane/projection-snapshot.ts', [
  'rebuildProjectionSnapshot',
  'rebuild_projection_snapshot',
  'PROJECTION_SNAPSHOT_REBUILT',
])

requireText('app/api/data-plane/projections/route.ts', [
  "authorizeProject(user.id, projectId, 'retention.manage')",
  "'REBUILD_SNAPSHOT'",
  'rebuildProjectionSnapshot',
  'listProjectionConsumerHealth',
])

requireText('supabase/migrations/20260904184659_projection_outbox_safe_retention.sql', [
  'prune_projection_outbox',
  'consumed_by_all_registered_project_consumers',
  'projection_checkpoints',
  'dgp-projection-outbox-retention',
])

requireText('supabase/migrations/20260904185639_projection_snapshot_rebuild.sql', [
  'rebuild_projection_snapshot',
  "operation='REBUILD'",
  'seed_initial_projection',
  'authoritative_snapshot_rebuild_v1',
])

requireText('supabase/migrations/20260904184950_semantic_index_durable_job_type.sql', [
  'SEMANTIC_INDEX',
  'job_queue_job_type_check',
])
requireText('lib/governance/semantic-jobs.ts', [
  'GOVERNANCE_EMBEDDING_URL',
  'semantic-index:',
  'SEMANTIC_INDEX',
])
requireText('lib/governance/semantic-job-worker.ts', [
  'reindexProjectSemanticObjects',
  'reindexProjectDocumentSemanticObjects',
  'markDurableJobSucceeded',
])

requireText('supabase/migrations/20260904185342_object_artifact_lifecycle_registry.sql', [
  'orchestration.object_artifacts',
  'retention_until',
  "'ACTIVE','DELETING','DELETED','FAILED'",
])
requireText('lib/data-plane/providers/supabase-object-store.ts', [
  'object_artifacts',
  'retentionUntil',
  "lifecycle_status: 'DELETING'",
  "lifecycle_status: 'DELETED'",
])
requireText('lib/data-plane/object-lifecycle.ts', [
  'cleanupExpiredObjectArtifacts',
  "lifecycle_status', 'ACTIVE'",
  "not('retention_until', 'is', null)",
  'store.delete',
])
requireText('app/api/jobs/worker/route.ts', [
  'processSemanticIndexJobs',
  'enqueueDailySemanticIndexJobs',
  'cleanupExpiredObjectArtifacts',
])

console.log('Data-plane projection, semantic indexing, and object lifecycle operations contracts verified.')
