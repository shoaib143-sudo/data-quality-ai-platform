import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireUser } from '@/lib/auth/require-user'
import { executePreparedProfilingJob } from '@/lib/agents/run-profiling-job'
import { executeQualityAutomation } from '@/lib/data-quality/automation'
import { evaluateObservabilitySignals } from '@/lib/observability/evaluate'
import { enqueueDueSchedules } from '@/lib/orchestration/schedules'
import {
  claimDurableJobByAgentRun,
  claimDurableJobs,
  markDurableJobFailed,
  markDurableJobSucceeded,
  type DurableJob,
} from '@/lib/orchestration/queue'

export const maxDuration = 300

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

async function executeJob(job: DurableJob) {
  const payload = job.payload ?? {}
  if (job.job_type === 'PROFILING') {
    const userId = text(payload.userId)
    const projectId = text(payload.projectId)
    const datasetVersionId = text(payload.datasetVersionId)
    const agentDefinitionId = text(payload.agentDefinitionId)
    const agentVersion = text(payload.agentVersion)
    const agentRunId = text(payload.agentRunId)
    const profilingRunId = text(payload.profilingRunId)
    const requestInput = payload.requestInput && typeof payload.requestInput === 'object' && !Array.isArray(payload.requestInput)
      ? payload.requestInput as Record<string, unknown>
      : {}
    if (!userId || !projectId || !datasetVersionId || !agentDefinitionId || !agentVersion || !agentRunId || !profilingRunId) {
      throw new Error('Durable profiling job payload is incomplete.')
    }
    await executePreparedProfilingJob({ userId, projectId, datasetVersionId, agentDefinitionId, agentVersion, agentRunId, profilingRunId, requestInput })
    return
  }

  if (job.job_type === 'DATA_QUALITY') {
    const datasetVersionId = text(payload.datasetVersionId)
    const profileRunId = text(payload.profileRunId)
    const userId = text(payload.userId)
    const agentRunId = text(payload.agentRunId)
    if (!datasetVersionId || !profileRunId || !agentRunId) throw new Error('Durable data quality job payload is incomplete.')
    await executeQualityAutomation({
      datasetVersionId,
      profileRunId,
      userId: userId || null,
      existingAgentRunId: agentRunId,
    })
    await evaluateObservabilitySignals(datasetVersionId, profileRunId)
    return
  }

  if (job.job_type === 'OBSERVABILITY') {
    const datasetVersionId = text(payload.datasetVersionId)
    const profileRunId = text(payload.profileRunId)
    if (!datasetVersionId || !profileRunId) throw new Error('Durable observability job payload is incomplete.')
    await evaluateObservabilitySignals(datasetVersionId, profileRunId)
    return
  }

  throw new Error(`Unsupported durable job type: ${job.job_type}`)
}

async function processJobs(jobs: DurableJob[]) {
  const results: Array<Record<string, unknown>> = []
  for (const job of jobs) {
    try {
      await executeJob(job)
      await markDurableJobSucceeded(job.id)
      results.push({ jobId: job.id, agentRunId: job.agent_run_id, status: 'SUCCEEDED' })
    } catch (error) {
      await markDurableJobFailed(job, error)
      results.push({ jobId: job.id, agentRunId: job.agent_run_id, status: job.attempts >= job.max_attempts ? 'DEAD' : 'RETRY', error: error instanceof Error ? error.message : 'Job execution failed.' })
    }
  }
  return results
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET
  const authorization = request.headers.get('authorization')
  const userAgent = request.headers.get('user-agent') ?? ''
  const authorized = cronSecret
    ? authorization === `Bearer ${cronSecret}`
    : userAgent.toLowerCase().includes('vercel-cron')
  if (!authorized) return NextResponse.json({ error: 'Worker access denied.' }, { status: 403 })

  const workerId = `vercel-cron:${crypto.randomUUID()}`
  const scheduled = await enqueueDueSchedules(20)
  const jobs = await claimDurableJobs(workerId, 2)
  const results = await processJobs(jobs)
  return NextResponse.json({ workerId, scheduled, claimed: jobs.length, results })
}

export async function POST(request: Request) {
  const user = await requireUser()
  const body = await request.json().catch(() => ({}))
  const agentRunId = text(body.agentRunId)
  if (!agentRunId) return NextResponse.json({ error: 'agentRunId is required.' }, { status: 400 })

  const admin = createAdminClient()
  const { data: run, error: runError } = await admin.schema('agent').from('agent_runs').select('id,project_id').eq('id', agentRunId).maybeSingle()
  if (runError || !run) return NextResponse.json({ error: 'Agent run not found.' }, { status: 404 })
  const { data: project } = await admin.schema('app').from('projects').select('id,organization_id').eq('id', run.project_id).maybeSingle()
  if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 })
  const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })

  const workerId = `user-kick:${user.id}:${crypto.randomUUID()}`
  const job = await claimDurableJobByAgentRun(workerId, agentRunId)
  if (!job) return NextResponse.json({ accepted: true, claimed: false, message: 'The job is already running, complete, or waiting for retry.' })
  const results = await processJobs([job])
  return NextResponse.json({ accepted: true, claimed: true, results })
}
