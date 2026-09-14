import fs from 'node:fs'
import path from 'node:path'

function read(relativePath) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), 'utf8')
}

function requireText(source, text, message) {
  if (!source.includes(text)) throw new Error(message)
}

const enqueue = read('lib/governance/approval-notifications.ts')
const worker = read('lib/governance/approval-notification-worker.ts')
const migration = read('supabase/migrations/20260915022000_harden_approval_notification_delivery.sql')

requireText(migration, 'dedupe_key text', 'Outbox must support an explicit notification dedupe key.')
requireText(migration, 'ux_agent_approval_notification_outbox_dedupe', 'Outbox dedupe key must be uniquely enforced.')
requireText(migration, "'DEAD_LETTER'::text", 'Outbox lifecycle must include a dead-letter terminal state.')
requireText(migration, 'dead_lettered_at timestamptz', 'Dead-letter time must be retained as delivery evidence.')
requireText(enqueue, "onConflict: 'dedupe_key'", 'Notification enqueueing must deduplicate repeated logical events.')
requireText(enqueue, "eventType === 'REMINDER'", 'Reminder dedupe must permit time-bucketed repeated reminders.')
requireText(worker, 'DATANEXUS_APPROVAL_NOTIFICATION_MAX_ATTEMPTS', 'Maximum notification attempts must be operationally configurable.')
requireText(worker, "status: deadLettered ? 'DEAD_LETTER' : 'FAILED'", 'Retry exhaustion must dead-letter rather than retry forever.')
requireText(worker, 'retryDelayMs', 'Notification retries must use bounded backoff.')
requireText(worker, 'openInDataNexusUrl', 'External payloads must carry a clear authoritative DataNexus path.')
requireText(worker, 'approvalUrl', 'External payloads must retain signed approval links.')
requireText(worker, "`${row.channel} provider returned HTTP ${response.status}.`", 'Provider response bodies must not be persisted into delivery errors.')
requireText(worker, ".in('status', ['PENDING','FAILED'])", 'Dead-letter notifications must not be automatically reclaimed.')

console.log('Approval notification robustness contract verified.')
