import fs from 'node:fs'

const dispatcher = fs.readFileSync('lib/orchestration/adaptive-dispatch.ts', 'utf8')
const workerRoute = fs.readFileSync('app/api/jobs/worker/route.ts', 'utf8')
const profilingRoute = fs.readFileSync('app/api/agents/run/route.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Adaptive scheduler v1 contract missing: ${label}`)
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

console.log('Adaptive Scheduler v1 contract verified.')
