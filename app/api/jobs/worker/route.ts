import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { evaluateIncidentSlaEscalations } from '@/lib/observability/incident-sla'
import { enqueueDueSchedules } from '@/lib/orchestration/schedules'
import { claimOutboxEvents, processOutboxEvents } from '@/lib/orchestration/outbox'
import { runOutboxLane, skippedOutboxLane, type OutboxLaneResult } from '@/lib/orchestration/outbox-lane'
import { claimDurableJobByAgentRun } from '@/lib/orchestration/queue'
import { processDurableJobs } from '@/lib/orchestration/worker'
import { dispatchAdaptiveRounds } from '@/lib/orchestration/adaptive-dispatch'
import { isAuthorizedWorkerBearer } from '@/lib/orchestration/worker-auth'
import { runProjectionWorker } from '@/lib/data-plane/run-projection-worker'
import { cleanupExpiredObjectArtifacts } from '@/lib/data-plane/object-lifecycle'
import { enqueueDailySemanticIndexJobs } from '@/lib/governance/semantic-jobs'
import { processSemanticIndexJobs } from '@/lib/governance/semantic-job-worker'
import { refreshAllPredictiveRisk } from '@/lib/governance/predictive-risk'
import { applyAllPredictiveRiskGovernedActions } from '@/lib/governance/governed-autonomy'
import { refreshAllAIGovernanceIntelligence } from '@/lib/governance/ai-governance-intelligence'
import { processGovernanceAgentJobs } from '@/lib/agents/governance-job-worker'

export const maxDuration = 300

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

function isAuthorizedWorkerRequest(request: Request) {
  const authorization = request.headers.get('authorization')
  const suppliedSecret = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
  return isAuthorizedWorkerBearer(suppliedSecret, process.env.CRON_SECRET)
}

function logOutboxLaneDegradation(workerId: string, lane: OutboxLaneResult) {
  if (!lane.degraded || lane.disposition === 'SKIPPED_AFTER_DEGRADATION') return
  const detail = lane.error ? `: ${lane.error}` : ''
  console.error('[worker-outbox]', `${workerId} ${lane.disposition}${detail}`.slice(0, 2000))
}

async function executeOutboxLane(workerId: string) {
  const lane = await runOutboxLane(workerId, 30, {
    claimEvents: claimOutboxEvents,
    processEvents: processOutboxEvents,
  })
  logOutboxLaneDegradation(workerId, lane)
  return lane
}

async function runAdaptiveEventConvergence(workerId: string) {
  const cycles: Array<Record<string, unknown>> = []
  const results: Array<Record<string, unknown>> = []
  const semanticResults: Array<Record<string, unknown>> = []
  const governanceAgentResults: Array<Record<string, unknown>> = []
  const eventResults: Array<Record<string, unknown>> = []
  const eventLaneDispositions: string[] = []
  let claimed = 0
  let eventsClaimed = 0
  let eventLaneBlocked = false
  let eventLaneDegraded = false

  for (let cycle = 1; cycle <= 3; cycle += 1) {
    const dispatch = await dispatchAdaptiveRounds(`${workerId}:jobs:${cycle}`, {
      maxRounds: 2,
      claimBatchSize: 8,
    })
    const eventWorkerId = `${workerId}:events:${cycle}`
    const eventLane = eventLaneBlocked ? skippedOutboxLane() : await executeOutboxLane(eventWorkerId)
    if (eventLane.degraded && eventLane.disposition !== 'SKIPPED_AFTER_DEGRADATION') {
      eventLaneBlocked = true
      eventLaneDegraded = true
    }

    claimed += dispatch.claimed
    eventsClaimed += eventLane.claimed
    results.push(...dispatch.results)
    semanticResults.push(...dispatch.semanticResults)
    governanceAgentResults.push(...dispatch.governanceAgentResults)
    eventResults.push(...eventLane.results)
    eventLaneDispositions.push(eventLane.disposition)
    cycles.push({
      cycle,
      jobsClaimed: dispatch.claimed,
      dispatchRounds: dispatch.rounds,
      eventsClaimed: eventLane.claimed,
      eventLaneDegraded: eventLane.degraded,
      eventLaneDisposition: eventLane.disposition,
    })

    if (dispatch.claimed === 0 && eventLane.claimed === 0) break
  }

  return {
    cycles,
    claimed,
    eventsClaimed,
    results,
    semanticResults,
    governanceAgentResults,
    eventResults,
    eventLaneDegraded,
    eventLaneDispositions,
  }
}

export async function GET(request: Request) {
  if (!isAuthorizedWorkerRequest(request)) return NextResponse.json({ error: 'Worker access denied.' }, { status: 403 })

  const workerId = `scheduled-worker:${crypto.randomUUID()}`
  const scheduled = await enqueueDueSchedules(20)
  const dispatch = await dispatchAdaptiveRounds(workerId)
  const eventLane = await executeOutboxLane(workerId)
  const [incidentEscalations, projections, semanticIndexScheduling, objectRetention] = await Promise.all([
    evaluateIncidentSlaEscalations(50),
    runProjectionWorker({ projectLimit: 10, batchSize: 200 }),
    enqueueDailySemanticIndexJobs(100),
    cleanupExpiredObjectArtifacts(25),
  ])
  const predictiveRisk = await refreshAllPredictiveRisk()
  const aiGovernanceIntelligence = await refreshAllAIGovernanceIntelligence()
  const governedAutonomy = await applyAllPredictiveRiskGovernedActions()

  return NextResponse.json({
    workerId,
    scheduled,
    adaptiveDispatch: true,
    dispatchRounds: dispatch.rounds,
    claimed: dispatch.claimed,
    results: dispatch.results,
    semanticResults: dispatch.semanticResults,
    governanceAgentResults: dispatch.governanceAgentResults,
    semanticIndexScheduling,
    objectRetention,
    predictiveRisk,
    aiGovernanceIntelligence,
    governedAutonomy,
    eventsClaimed: eventLane.claimed,
    eventResults: eventLane.results,
    eventLaneDegraded: eventLane.degraded,
    eventLaneDisposition: eventLane.disposition,
    incidentEscalations,
    projections,
  })
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const mode = text(body.mode)

  if (mode === 'ADAPTIVE_DISPATCH') {
    if (!isAuthorizedWorkerRequest(request)) return NextResponse.json({ error: 'Worker access denied.' }, { status: 403 })
    try {
      const workerId = `event-worker:${crypto.randomUUID()}`
      const convergence = await runAdaptiveEventConvergence(workerId)
      return NextResponse.json({
        accepted: true,
        mode,
        workerId,
        convergenceCycles: convergence.cycles,
        claimed: convergence.claimed,
        eventsClaimed: convergence.eventsClaimed,
        results: convergence.results,
        semanticResults: convergence.semanticResults,
        governanceAgentResults: convergence.governanceAgentResults,
        eventResults: convergence.eventResults,
        eventLaneDegraded: convergence.eventLaneDegraded,
        eventLaneDispositions: convergence.eventLaneDispositions,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Adaptive worker execution failed.'
      console.error('[worker-dispatch]', message.slice(0, 2000))
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  try {
    const user = await requireUser()
    const agentRunId = text(body.agentRunId)
    if (!agentRunId) return NextResponse.json({ error: 'agentRunId is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: run, error: runError } = await admin.schema('agent').from('agent_runs').select('id,project_id').eq('id', agentRunId).maybeSingle()
    if (runError || !run) return NextResponse.json({ error: 'Agent run not found.' }, { status: 404 })
    await authorizeProject(user.id, run.project_id, 'catalog.read')

    const workerId = `user-kick:${user.id}:${crypto.randomUUID()}`
    const job = await claimDurableJobByAgentRun(workerId, agentRunId)
    if (!job) return NextResponse.json({ accepted: true, claimed: false, message: 'The job is already running, complete, or waiting for retry.' })
    if (job.job_type === 'SEMANTIC_INDEX') {
      const semanticResults = await processSemanticIndexJobs([job])
      return NextResponse.json({ accepted: true, claimed: true, semanticResults })
    }
    if (job.job_type === 'GOVERNANCE_AGENT') {
      const governanceAgentResults = await processGovernanceAgentJobs([job])
      return NextResponse.json({ accepted: true, claimed: true, governanceAgentResults })
    }
    const results = await processDurableJobs([job])
    return NextResponse.json({ accepted: true, claimed: true, results })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Worker execution failed.' }, { status: 500 })
  }
}