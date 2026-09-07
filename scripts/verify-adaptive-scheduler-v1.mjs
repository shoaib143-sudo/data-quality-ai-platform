import fs from 'node:fs'

const dispatcher = fs.readFileSync('lib/orchestration/adaptive-dispatch.ts', 'utf8')
const queue = fs.readFileSync('lib/orchestration/queue.ts', 'utf8')
const workload = fs.readFileSync('lib/orchestration/workload.ts', 'utf8')
const dqQueue = fs.readFileSync('lib/data-quality/queue.ts', 'utf8')
const workerRoute = fs.readFileSync('app/api/jobs/worker/route.ts', 'utf8')
const profilingRoute = fs.readFileSync('app/api/agents/run/route.ts', 'utf8')
const eventDispatchMigration = fs.readFileSync('supabase/migrations/20260907060500_event_driven_durable_worker_dispatch.sql', 'utf8')
const dagMigration = fs.readFileSync('supabase/migrations/20260907103500_durable_job_dag_dependencies.sql', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Adaptive scheduler contract missing: ${label}`)
}

requireText(dispatcher, 'getProjectCapacityPolicy', 'project capacity enforcement')
requireText(dispatcher, 'ORCHESTRATION_WORKER_CONCURRENCY', 'bounded configurable concurrency')
requireText(dispatcher, 'ORCHESTRATION_PER_SOURCE_CONCURRENCY', 'source concurrency guardrail')
requireText(dispatcher, "from('dataset_execution_sources')", 'execution source resource resolution')
requireText(dispatcher, 'selectResourceBoundedBatch', 'resource-aware scheduler')
requireText(dispatcher, 'characterizeDurableJobs(jobs)', 'workload characterization')
requireText(dispatcher, 'orderJobsByEstimatedRuntime(jobs, workload)', 'runtime-aware ordering')
requireText(queue, "'job.queue_wait_ms'", 'queue wait telemetry')
requireText(queue, 'dependencies?: DurableJobDependency[]', 'dependency-aware enqueue contract')
requireText(queue, "rpc('enqueue_job_with_dependencies'", 'atomic job and dependency enqueue')
requireText(queue, 'dependency_count: dependencies.length', 'dependency telemetry')

requireText(workload, "export type WorkloadClass = 'SMALL' | 'MEDIUM' | 'LARGE' | 'UNKNOWN'", 'workload classes')
requireText(workload, 'if (value == null) return null', 'null numeric evidence preservation')
requireText(workload, "typeof value === 'string' && value.trim() === ''", 'blank numeric evidence preservation')
requireText(workload, 'PROFILE_SAMPLE_NOT_SOURCE_CARDINALITY', 'sample/source truth boundary')
requireText(workload, "sourceObservedEstimate(metadata, 'source_row_count', 'source_row_count_authority')", 'source row authority gate')
requireText(workload, "metric_key: 'planner.workload_classified'", 'workload telemetry')
requireText(workload, 'while (end < jobs.length && jobs[end].priority === priority)', 'no cross-priority runtime reordering')

requireText(workerRoute, "mode === 'ADAPTIVE_DISPATCH'", 'worker-secret event dispatch mode')
requireText(workerRoute, 'runAdaptiveEventConvergence', 'job and outbox convergence loop')
requireText(workerRoute, 'processOutboxEvents(events)', 'event-driven outbox processing')
requireText(profilingRoute, 'claimDurableJobByAgentRun(workerId, activeAgentRunId)', 'exact profiling job kick')
requireText(eventDispatchMigration, 'net.http_post(', 'asynchronous database wake-up')
requireText(eventDispatchMigration, 'after insert on orchestration.job_queue', 'queue insert wake trigger')

requireText(dagMigration, 'create table if not exists orchestration.job_dependencies', 'persisted dependency edges')
requireText(dagMigration, "dependency_type text not null default 'SUCCESS'", 'typed dependency semantics')
requireText(dagMigration, 'job_dependencies_child_project_fkey', 'same-project child FK')
requireText(dagMigration, 'job_dependencies_parent_project_fkey', 'same-project parent FK')
requireText(dagMigration, 'validate_job_dependency_cycle', 'cycle prevention')
requireText(dagMigration, 'enqueue_job_with_dependencies', 'atomic dependent enqueue RPC')
requireText(dagMigration, 'resolve_failed_job_dependencies', 'failed prerequisite propagation')
requireText(dagMigration, "status = 'CANCELLED'", 'truthful blocked child terminal state')
requireText(dagMigration, "parent.status <> 'SUCCEEDED'", 'SUCCESS dependency claim blocking')
requireText(dagMigration, "parent.status not in ('SUCCEEDED','FAILED','DEAD','CANCELLED')", 'TERMINAL dependency claim blocking')
requireText(dagMigration, 'create or replace function orchestration.claim_job_by_agent_run', 'exact claim dependency enforcement')
requireText(dagMigration, 'scheduler dependencies only and are not source-observed data lineage', 'dependency versus lineage truth boundary')

requireText(dqQueue, "dependencyType: 'SUCCESS'", 'profile to DQ SUCCESS dependency')
requireText(dqQueue, ".eq('agent_run_id', parentRunId)", 'parent durable job resolution')
requireText(dqQueue, 'dependencies,', 'DQ atomic dependency enqueue')
requireText(dqQueue, 'parentDurableJobId', 'dependency audit referent')

if (eventDispatchMigration.includes('after update on orchestration.job_queue')) {
  throw new Error('Scheduler must not create retry-trigger storms from ordinary queue updates.')
}
if (dispatcher.includes('execution_config.jdbc_url') || dispatcher.includes('credential_ref')) {
  throw new Error('Resource scheduling must use stable source identity rather than credential or JDBC URL identity.')
}
if (workload.includes("sourceRowEstimate = observedRowCount") || workload.includes("row_count_authority: 'SOURCE_OBSERVED'")) {
  throw new Error('Profile/sample row counts must never be promoted to source-authoritative cardinality.')
}

console.log('Adaptive Scheduler persisted DAG and workload truth contracts verified.')
