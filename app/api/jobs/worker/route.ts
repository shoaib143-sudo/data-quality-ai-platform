import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { claimDurableJobByAgentRun } from '@/lib/orchestration/queue'
import { isAuthorizedWorkerBearer } from '@/lib/orchestration/worker-auth'
import {
  processClaimedDurableJob,
  runAdaptiveWorkerCycle,
  runCloudflareObservabilityCanaryCycle,
  runScheduledWorkerCycle,
} from '@/lib/orchestration/worker-service'

export const maxDuration = 300

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

function isAuthorizedWorkerRequest(request: Request) {
  const authorization = request.headers.get('authorization')
  const suppliedSecret = authorization?.startsWith('Bearer ') ? authorization.slice('Bearer '.length).trim() : ''
  return isAuthorizedWorkerBearer(suppliedSecret, process.env.CRON_SECRET)
}

export async function GET(request: Request) {
  if (!isAuthorizedWorkerRequest(request)) return NextResponse.json({ error: 'Worker access denied.' }, { status: 403 })

  const workerId = `scheduled-worker:${crypto.randomUUID()}`
  return NextResponse.json(await runScheduledWorkerCycle(workerId))
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({})) as Record<string, unknown>
  const mode = text(body.mode)

  if (mode === 'CLOUDFLARE_OBSERVABILITY_CANARY') {
    if (!isAuthorizedWorkerRequest(request)) return NextResponse.json({ error: 'Worker access denied.' }, { status: 403 })
    const workerId = `cloudflare-observability-canary:${crypto.randomUUID()}`
    try {
      return NextResponse.json({
        accepted: true,
        ...await runCloudflareObservabilityCanaryCycle(workerId),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloudflare observability canary execution failed.'
      console.error('[cloudflare-observability-canary]', message.slice(0, 2000))
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }

  if (mode === 'ADAPTIVE_DISPATCH') {
    if (!isAuthorizedWorkerRequest(request)) return NextResponse.json({ error: 'Worker access denied.' }, { status: 403 })
    try {
      const workerId = `event-worker:${crypto.randomUUID()}`
      const convergence = await runAdaptiveWorkerCycle(workerId)
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
    await authorizeProject(user.id, run.project_id, 'execution.retry')

    const workerId = `user-kick:${user.id}:${crypto.randomUUID()}`
    const job = await claimDurableJobByAgentRun(workerId, agentRunId)
    if (!job) return NextResponse.json({ accepted: true, claimed: false, message: 'The job is already running, complete, or waiting for retry.' })

    return NextResponse.json({
      accepted: true,
      claimed: true,
      ...await processClaimedDurableJob(job),
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Worker execution failed.', }, { status: 500 })
  }
}
