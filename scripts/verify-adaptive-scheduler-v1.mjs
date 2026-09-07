import fs from 'node:fs'

const dispatcher = fs.readFileSync('lib/orchestration/adaptive-dispatch.ts', 'utf8')
const workerRoute = fs.readFileSync('app/api/jobs/worker/route.ts', 'utf8')
const profilingRoute = fs.readFileSync('app/api/agents/run/route.ts', 'utf8')
const eventDispatchMigration = fs.readFileSync('supabase/migrations/20260907060500_event_driven_durable_worker_dispatch.sql', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Adaptive scheduler contract missing: ${label}`)
}

requireText(dispatcher, 'getProjectCapacityPolicy', 'project capacity enforcement')
requireText(dispatcher, 'ORCHESTRATION_WORKER_CONCURRENCY', 'bounded configurable concurrency')
requireText(dispatcher, 'Promise.all(batch.map((job) => processDurableJobs([job])))', 'parallel independent core execution')
requireText(dispatcher, 'dispatchAdaptiveRounds', 'multi-round downstream draining')
requireText(workerRoute, 'dispatchAdaptiveRounds(workerId)', 'scheduled adaptive dispatch')
requireText(workerRoute, 'adaptiveDispatch: true', 'worker observability flag')
requireText(profilingRoute, "import { after, NextResponse } from 'next/server'", 'post-response execution hook')
requireText(profilingRoute, 'claimDurableJobByAgentRun(workerId, activeAgentRunId)', 'exact profiling job kick')
requireText(profilingRoute, 'dispatchAdaptiveRounds(`${workerId}:downstream`', 'immediate downstream drain')
requireText(profilingRoute, 'adaptive_dispatch: true', 'profiling API dispatch evidence')

requireText(workerRoute, "mode === 'ADAPTIVE_DISPATCH'", 'worker-secret event dispatch mode')
requireText(workerRoute, 'isAuthorizedWorkerRequest(request)', 'event dispatch authorization')
requireText(workerRoute, 'claimBatchSize: 8', 'event dispatch bounded claim size')
requireText(workerRoute, 'runAdaptiveEventConvergence', 'job and outbox convergence loop')
requireText(workerRoute, 'claimOutboxEvents(`${workerId}:events:${cycle}`, 30)', 'event-driven outbox claim')
requireText(workerRoute, 'processOutboxEvents(events)', 'event-driven outbox processing')
requireText(workerRoute, 'if (dispatch.claimed === 0 && events.length === 0) break', 'bounded quiescence stop')
requireText(eventDispatchMigration, 'create table if not exists orchestration.worker_dispatch_state', 'debounce state')
requireText(eventDispatchMigration, 'net.http_post(', 'asynchronous database wake-up')
requireText(eventDispatchMigration, "'mode', 'ADAPTIVE_DISPATCH'", 'lightweight worker mode payload')
requireText(eventDispatchMigration, "last_kicked_at <= clock_timestamp() - interval '750 milliseconds'", 'dispatch debounce')
requireText(eventDispatchMigration, 'A wake-up failure must never roll back the durable queue insert.', 'durability failure isolation')
requireText(eventDispatchMigration, 'after insert on orchestration.job_queue', 'queue insert wake trigger')
requireText(eventDispatchMigration, "new.available_at > clock_timestamp() + interval '1 second'", 'future job cron fallback')

if (eventDispatchMigration.includes('after update on orchestration.job_queue')) {
  throw new Error('Scheduler v2 must not create retry-trigger storms from ordinary queue updates.')
}

console.log('Adaptive Scheduler v2 event-driven convergence contract verified.')
