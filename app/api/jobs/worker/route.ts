import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { evaluateIncidentSlaEscalations } from '@/lib/observability/incident-sla'
import { enqueueDueSchedules } from '@/lib/orchestration/schedules'
import { claimOutboxEvents, processOutboxEvents } from '@/lib/orchestration/outbox'
import {
  claimDurableJobByAgentRun,
  claimDurableJobs,
} from '@/lib/orchestration/queue'
import { processDurableJobs } from '@/lib/orchestration/worker'
import { runProjectionWorker } from '@/lib/data-plane/run-projection-worker'
import { cleanupExpiredObjectArtifacts } from '@/lib/data-plane/object-lifecycle'
import { enqueueDailySemanticIndexJobs } from '@/lib/governance/semantic-jobs'
import { processSemanticIndexJobs } from '@/lib/governance/semantic-job-worker'
import { refreshAllPredictiveRisk } from '@/lib/governance/predictive-risk'

export const maxDuration = 300

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

async function isAuthorizedWorkerRequest(request: Request) {
  const authorization = request.headers.get('authorization')
  const suppliedSecret = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
  if (!suppliedSecret) return false

  const configuredSecret = process.env.CRON_SECRET
  if (configuredSecret && suppliedSecret === configuredSecret) return true

  const admin = createAdminClient()
  const { data, error } = await admin.schema('orchestration').rpc('verify_worker_secret', { p_secret: suppliedSecret })
  if (error) {
    console.error('[worker-auth]', error.message)
    return false
  }
  return data === true
}

export async function GET(request: Request) {
  if (!(await isAuthorizedWorkerRequest(request))) return NextResponse.json({ error: 'Worker access denied.' }, { status: 403 })

  const workerId = `scheduled-worker:${crypto.randomUUID()}`
  const scheduled = await enqueueDueSchedules(20)
  const jobs = await claimDurableJobs(workerId, 2)
  const semanticJobs = jobs.filter((job) => job.job_type === 'SEMANTIC_INDEX')
  const coreJobs = jobs.filter((job) => job.job_type !== 'SEMANTIC_INDEX')
  const [results, semanticResults] = await Promise.all([
    processDurableJobs(coreJobs),
    processSemanticIndexJobs(semanticJobs),
  ])
  const events = await claimOutboxEvents(workerId, 30)
  const eventResults = await processOutboxEvents(events)
  const [incidentEscalations, projections, semanticIndexScheduling, objectRetention, predictiveRisk] = await Promise.all([
    evaluateIncidentSlaEscalations(50),
    runProjectionWorker({ projectLimit: 10, batchSize: 200 }),
    enqueueDailySemanticIndexJobs(100),
    cleanupExpiredObjectArtifacts(25),
    refreshAllPredictiveRisk(),
  ])
  return NextResponse.json({
    workerId,
    scheduled,
    claimed: jobs.length,
    results,
    semanticResults,
    semanticIndexScheduling,
    objectRetention,
    predictiveRisk,
    eventsClaimed: events.length,
    eventResults,
    incidentEscalations,
    projections,
  })
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))
    const agentRunId = text(body.agentRunId)
    if (!agentRunId) return NextResponse.json({ error: 'agentRunId is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: run, error: runError } = await admin.schema('agent').from('agent_runs').select('id,project_id').eq('id', agentRunId).maybeSingle()
    if (runError || !run) return NextResponse.json({ error: 'Agent run not found.' }, { status: 404 })
    await authorizeProject(user.id, run.project_id, 'catalog.read')

    const workerId = `user-kick:${user.id}:${crypto.randomUUID()}`
    const job = await claimDurableJobByAgentRun(workerId, agentRunId)
    if (!job) return NextResponse.json({ accepted: true, claimed: false, message: 'The job is already running, complete, or waiting for retry.' })
    const results = await processDurableJobs([job])
    return NextResponse.json({ accepted: true, claimed: true, results })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Worker execution failed.' }, { status: 500 })
  }
}
