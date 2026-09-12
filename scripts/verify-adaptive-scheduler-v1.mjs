import fs from 'node:fs'

const dispatcher = fs.readFileSync('lib/orchestration/adaptive-dispatch.ts', 'utf8')
const queue = fs.readFileSync('lib/orchestration/queue.ts', 'utf8')
const workload = fs.readFileSync('lib/orchestration/workload.ts', 'utf8')
const criticalPath = fs.readFileSync('lib/orchestration/critical-path.ts', 'utf8')
const sourceConcurrency = fs.readFileSync('lib/orchestration/source-concurrency.ts', 'utf8')
const dqQueue = fs.readFileSync('lib/data-quality/queue.ts', 'utf8')
const workerRoute = fs.readFileSync('app/api/jobs/worker/route.ts', 'utf8')
const profilingRoute = fs.readFileSync('app/api/agents/run/route.ts', 'utf8')
const eventDispatchMigration = fs.readFileSync('supabase/migrations/20260907060500_event_driven_durable_worker_dispatch.sql', 'utf8')
const dagMigration = fs.readFileSync('supabase/migrations/20260907103500_durable_job_dag_dependencies.sql', 'utf8')
const sourceConcurrencyMigration = fs.readFileSync('supabase/migrations/20260907110500_adaptive_source_concurrency_state.sql', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Adaptive scheduler contract missing: ${label}`)
}

requireText(dispatcher, 'getProjectCapacityPolicy', 'project capacity enforcement')
requireText(dispatcher, 'ORCHESTRATION_WORKER_CONCURRENCY', 'bounded configurable concurrency')
requireText(dispatcher, 'ORCHESTRATION_PER_SOURCE_CONCURRENCY', 'initial source concurrency')
requireText(dispatcher, 'ORCHESTRATION_PER_SOURCE_MAX_CONCURRENCY', 'source concurrency hard ceiling')
requireText(dispatcher, 'resolveAdaptiveSourceLimits(resources, initialPerSourceConcurrency, hardPerSourceMax)', 'persisted adaptive source limit resolution')
requireText(dispatcher, 'sourceCounts.get(stateKey)', 'project-scoped source concurrency accounting')
requireText(dispatcher, 'characterizeDurableJobs(jobs)', 'workload characterization')
requireText(dispatcher, 'computeCriticalPathProfiles(jobs, workload)', 'persisted DAG critical-path calculation')
requireText(dispatcher, 'orderJobsByCriticalPath(jobs, criticalPath, workload)', 'critical-path ordering')
requireText(dispatcher, 'recordCriticalPathTelemetry(jobs, criticalPath)', 'critical-path telemetry')
requireText(queue, "'job.queue_wait_ms'", 'queue wait telemetry')
requireText(queue, 'dependencies?: DurableJobDependency[]', 'dependency-aware enqueue contract')
requireText(queue, "rpc('enqueue_job_with_dependencies'", 'atomic job and dependency enqueue')
requireText(queue, 'recordSourceConcurrencyOutcome(job, \'SUCCESS\')', 'clean source signal on successful durable jobs')
requireText(queue, "recordSourceConcurrencyOutcome(job, 'FAILURE', error)", 'source pressure signal on failed durable jobs')
requireText(queue, "console.error('[source-concurrency-controller]'", 'controller telemetry must not fail durable job completion')

requireText(workload, "export type WorkloadClass = 'SMALL' | 'MEDIUM' | 'LARGE' | 'UNKNOWN'", 'workload classes')
requireText(workload, 'if (value == null) return null', 'null numeric evidence preservation')
requireText(workload, "typeof value === 'string' && value.trim() === ''", 'blank numeric evidence preservation')
requireText(workload, 'PROFILE_SAMPLE_NOT_SOURCE_CARDINALITY', 'sample/source truth boundary')
requireText(workload, "sourceObservedEstimate(metadata, 'source_row_count', 'source_row_count_authority')", 'source row authority gate')
requireText(workload, "metric_key: 'planner.workload_classified'", 'workload telemetry')

requireText(criticalPath, "from('job_dependencies')", 'persisted scheduler DAG source')
requireText(criticalPath, 'MAX_GRAPH_DEPTH = 8', 'bounded dependency traversal depth')
requireText(criticalPath, 'MAX_GRAPH_EDGES = 1000', 'bounded dependency traversal size')
requireText(criticalPath, 'depth >= MAX_GRAPH_DEPTH && frontier.length > 0', 'depth truncation detection')
requireText(criticalPath, "TERMINAL_STATUSES.has(row.status)", 'terminal descendants contribute no future runtime')
requireText(criticalPath, 'own + downstream', 'bottom-level critical-path weighting')
requireText(criticalPath, 'while (end < jobs.length && jobs[end].priority === priority)', 'no cross-priority critical-path reordering')
requireText(criticalPath, "metric_key: 'planner.critical_path_ms'", 'critical-path telemetry metric')
requireText(criticalPath, "evidence_scope: 'PERSISTED_SCHEDULER_DAG_ONLY'", 'no speculative future fanout')

requireText(sourceConcurrency, "from('dataset_execution_sources')", 'governed source identity resolution')
requireText(sourceConcurrency, "key: sourceId ? `source:${sourceId}` : null", 'stable source scheduler identity')
requireText(sourceConcurrency, "from('source_concurrency_state')", 'persisted controller state read')
requireText(sourceConcurrency, 'Math.min(requestedInitial, configuredMax)', 'initial limit must obey hard max')
requireText(sourceConcurrency, "outcome === 'FAILURE' && !pressureError(error)", 'generic failures must not throttle source')
requireText(sourceConcurrency, 'too many requests|rate.?limit|throttl', 'source pressure classifier')
requireText(sourceConcurrency, "rpc('record_source_concurrency_signal'", 'stateful source signal persistence')

requireText(sourceConcurrencyMigration, 'create table if not exists orchestration.source_concurrency_state', 'persisted source controller state')
requireText(sourceConcurrencyMigration, "last_signal in ('INITIAL','CLEAN','ADVERSE')", 'typed source controller signals')
requireText(sourceConcurrencyMigration, 'success_streak + 1 >= 4', 'additive increase threshold')
requireText(sourceConcurrencyMigration, 'least(max_limit, current_limit + 1)', 'additive increase')
requireText(sourceConcurrencyMigration, 'floor(current_limit / 2.0)', 'multiplicative decrease')
requireText(sourceConcurrencyMigration, "metric_key, numeric_value, dimensions", 'controller telemetry write')
requireText(sourceConcurrencyMigration, "'planner.source_concurrency_limit'", 'controller limit telemetry metric')
requireText(sourceConcurrencyMigration, "'controller', 'AIMD'", 'controller algorithm evidence')
requireText(sourceConcurrencyMigration, 'controls execution concurrency only; it is not governance authority or source metadata', 'scheduler versus governance truth boundary')

requireText(workerRoute, "mode === 'ADAPTIVE_DISPATCH'", 'worker-secret event dispatch mode')
requireText(workerRoute, 'runAdaptiveEventConvergence', 'job and outbox convergence loop')
requireText(workerRoute, 'processEvents: processOutboxEvents', 'event-driven outbox processing through isolated lane')
requireText(workerRoute, 'runOutboxLane', 'isolated outbox lane boundary')
requireText(workerRoute, 'eventLaneBlocked ? skippedOutboxLane() : await executeOutboxLane(eventWorkerId)', 'stop re-hitting degraded outbox lane within adaptive convergence')
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
requireText(dagMigration, 'scheduler dependencies only and are not source-observed data lineage', 'dependency versus lineage truth boundary')

requireText(dqQueue, "dependencyType: 'SUCCESS'", 'profile to DQ SUCCESS dependency')
requireText(dqQueue, ".eq('agent_run_id', parentRunId)", 'parent durable job resolution')
requireText(dqQueue, 'dependencies,', 'DQ atomic dependency enqueue')
requireText(dqQueue, 'parentDurableJobId', 'dependency audit referent')

if (eventDispatchMigration.includes('after update on orchestration.job_queue')) {
  throw new Error('Scheduler must not create retry-trigger storms from ordinary queue updates.')
}
if (dispatcher.includes('execution_config.jdbc_url') || dispatcher.includes('credential_ref') || sourceConcurrency.includes('jdbc_url') || sourceConcurrency.includes('credential_ref')) {
  throw new Error('Resource scheduling must use stable source identity rather than credential or JDBC URL identity.')
}
if (workload.includes("sourceRowEstimate = observedRowCount") || workload.includes("row_count_authority: 'SOURCE_OBSERVED'")) {
  throw new Error('Profile/sample row counts must never be promoted to source-authoritative cardinality.')
}
if (criticalPath.includes('futureFanout') || criticalPath.includes('predicted_child')) {
  throw new Error('Critical-path planning must not fabricate downstream jobs that are not persisted in the scheduler DAG.')
}

console.log('Adaptive Scheduler stateful source concurrency, persisted DAG, and workload truth contracts verified.')
