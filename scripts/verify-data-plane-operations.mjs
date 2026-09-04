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

requireText('app/api/data-plane/projections/route.ts', [
  "authorizeProject(user.id, projectId, 'retention.manage')",
  "action?: 'RECONCILE' | 'RESET' | 'RESUME'",
  'listProjectionConsumerHealth',
])

requireText('supabase/migrations/20260904184659_projection_outbox_safe_retention.sql', [
  'prune_projection_outbox',
  'consumed_by_all_registered_project_consumers',
  'projection_checkpoints',
  'dgp-projection-outbox-retention',
])

console.log('Data-plane projection operations contracts verified.')
