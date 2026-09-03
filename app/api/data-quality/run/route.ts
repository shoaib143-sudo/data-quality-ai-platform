import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeDatasetVersion, AuthorizationError } from '@/lib/auth/authorize'
import { queueDataQualityAutomation } from '@/lib/data-quality/queue'

export const maxDuration = 300

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const datasetVersionId = text(body.datasetVersionId)
    const rawIdempotencyKey = text(request.headers.get('idempotency-key') ?? body.idempotencyKey ?? body.idempotency_key)
    let profileRunId = text(body.profileRunId)
    if (!datasetVersionId) return NextResponse.json({ error: 'datasetVersionId is required.' }, { status: 400 })

    const { dataset, version } = await authorizeDatasetVersion(user.id, datasetVersionId, 'quality.execute')
    const admin = createAdminClient()

    if (!profileRunId) {
      const { data: latestRun, error: runError } = await admin
        .schema('profiling')
        .from('profile_runs')
        .select('id,status')
        .eq('dataset_version_id', datasetVersionId)
        .eq('status', 'COMPLETED')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (runError) throw new Error(`Unable to resolve latest completed profile: ${runError.message}`)
      if (!latestRun) return NextResponse.json({ error: 'A completed profiling run is required before quality rules can execute.' }, { status: 409 })
      profileRunId = latestRun.id
    } else {
      const { data: run, error: runError } = await admin
        .schema('profiling')
        .from('profile_runs')
        .select('id,status')
        .eq('id', profileRunId)
        .eq('dataset_version_id', datasetVersionId)
        .maybeSingle()
      if (runError) throw new Error(`Unable to validate selected profiling run: ${runError.message}`)
      if (!run || run.status !== 'COMPLETED') return NextResponse.json({ error: 'The selected profiling run is unavailable or incomplete.' }, { status: 409 })
    }

    const queued = await queueDataQualityAutomation({
      projectId: dataset.project_id,
      datasetId: dataset.id,
      datasetVersionId: version.id,
      profileRunId,
      userId: user.id,
      requestedByUser: true,
      idempotencyKey: rawIdempotencyKey ? `data-quality:manual:${rawIdempotencyKey}` : null,
    })

    return NextResponse.json({
      accepted: true,
      execution_completed: false,
      agentRunId: queued.agentRunId,
      profileRunId,
      durableJobId: queued.durableJobId,
      reused: queued.reused,
      monitorUrl: `/monitoring?run=${encodeURIComponent(queued.agentRunId)}`,
    }, { status: 202 })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Data quality automation failed.' }, { status: 500 })
  }
}
