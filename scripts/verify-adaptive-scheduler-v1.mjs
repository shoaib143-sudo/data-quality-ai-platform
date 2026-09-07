import fs from 'node:fs'

const dispatcher = fs.readFileSync('lib/orchestration/adaptive-dispatch.ts', 'utf8')
const queue = fs.readFileSync('lib/orchestration/queue.ts', 'utf8')
const workload = fs.readFileSync('lib/orchestration/workload.ts', 'utf8')
const workerRoute = fs.readFileSync('app/api/jobs/worker/route.ts', 'utf8')
const profilingRoute = fs.readFileSync('app/api/agents/run/route.ts', 'utf8')
const eventDispatchMigration = fs.readFileSync('supabase/migrations/20260907060500_event_driven_durable_worker_dispatch.sql', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Adaptive scheduler contract missing: ${label}`)
}

requireText(dispatcher, 'getProjectCapacityPolicy', 'project capacity enforcement')
requireText(dispatcher, 'ORCHESTRATION_WORKER_CONCURRENCY', 'bounded configurable concurrency')
requireText(dispatcher, 'ORCHESTRATION_PER_SOURCE_CONCURRENCY', 'source concurrency guardrail')
requireText(dispatcher, "schema('profiling')", 'governed execution source lookup')
requireText(dispatcher, "from('dataset_execution_sources')", 'execution source resource resolution')
requireText(dispatcher, "key: sourceId ? `source:${sourceId}` : null", 'stable source resource key')
requireText(dispatcher, 'selectResourceBoundedBatch', 'resource-aware greedy scheduler')
requireText(dispatcher, 'count >= perSourceLimit', 'per-source concurrency enforcement')
requireText(dispatcher, 'characterizeDurableJobs(jobs)', 'workload characterization')
requireText(dispatcher, 'orderJobsByEstimatedRuntime(jobs, workload)', 'runtime-aware ordering')
requireText(dispatcher, 'recordWorkloadTelemetry(jobs, workload)', 'planner evidence telemetry')
requireText(dispatcher, 'Promise.all(batch.map((job) => processDurableJobs([job])))', 'parallel independent core execution')
requireText(dispatcher, 'dispatchAdaptiveRounds', 'multi-round downstream draining')
requireText(queue, "'job.queue_wait_ms'", 'queue wait telemetry')
requireText(queue, "dispatch_mode: job.lease_owner?.startsWith('event-worker:') ? 'EVENT_DRIVEN' : 'WORKER_CLAIM'", 'dispatch mode telemetry')

requireText(workload, "export type WorkloadClass = 'SMALL' | 'MEDIUM' | 'LARGE' | 'UNKNOWN'", 'explicit workload classes')
requireText(workload, "'PROFILE_SAMPLE'", 'sample cardinality authority')
requireText(workload, 'PROFILE_SAMPLE_NOT_SOURCE_CARDINALITY', 'sample/source truth boundary')
requireText(workload, "sourceObservedEstimate(metadata, 'source_row_count', 'source_row_count_authority')", 'source-authoritative row estimate gate')
requireText(workload, "sourceObservedEstimate(metadata, 'source_size_bytes', 'source_size_bytes_authority')", 'source-authoritative size estimate gate')
requireText(workload, "metric_key: 'planner.workload_classified'", 'workload telemetry')
requireText(workload, 'estimatedDurationMs', 'historical runtime estimate')
requireText(workload, 'const exactHistory = history.filter', 'entity-specific runtime history')
requireText(workload, 'const fallbackHistory = history.filter', 'project job-type runtime fallback')
requireText(workload, 'while (end < jobs.length && jobs[end].priority === priority)', 'no cross-priority runtime reordering')

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
if (dispatcher.includes('execution_config.jdbc_url') || dispatcher.includes('credential_ref')) {
  throw new Error('Resource scheduling must use stable source identity rather than credential or JDBC URL identity.')
}
if (workload.includes("sourceRowEstimate = observedRowCount") || workload.includes("row_count_authority: 'SOURCE_OBSERVED'")) {
  throw new Error('Profile/sample row counts must never be promoted to source-authoritative cardinality.')
}

console.log('Adaptive Scheduler workload-aware event-driven convergence contract verified.')
