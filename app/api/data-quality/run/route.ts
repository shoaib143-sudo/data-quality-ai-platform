import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { authorizeDatasetVersion, AuthorizationError } from '@/lib/auth/authorize'
import { queueDataQualityAutomation } from '@/lib/data-quality/queue'

export const maxDuration = 300

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

async function enabledQualityRuleCount(
  admin: ReturnType<typeof createAdminClient>,
  datasetId: string,
  datasetVersionId: string,
) {
  const { data, error } = await admin
    .schema('profiling')
    .from('quality_rule_definitions')
    .select('id,dataset_version_id')
    .eq('dataset_id', datasetId)
    .eq('enabled', true)
  if (error) throw new Error(`Unable to resolve enabled quality rules: ${error.message}`)
  return (data ?? []).filter(rule => !rule.dataset_version_id || rule.dataset_version_id === datasetVersionId).length
}

function errorResponse(error: unknown) {
  if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
  return NextResponse.json({ error: error instanceof Error ? error.message : 'Data quality automation failed.' }, { status: 500 })
}

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    const datasetVersionId = text(new URL(request.url).searchParams.get('datasetVersionId'))
    if (!datasetVersionId) return NextResponse.json({ error: 'datasetVersionId is required.' }, { status: 400 })

    const { dataset, version } = await authorizeDatasetVersion(user.id, datasetVersionId, 'quality.execute')
    const admin = createAdminClient()
    const enabledRuleCount = await enabledQualityRuleCount(admin, dataset.id, version.id)
    return NextResponse.json(
      { datasetVersionId: version.id, enabledRuleCount, executable: enabledRuleCount > 0 },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return errorResponse(error)
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const datasetVersionId = text(body.datasetVersionId)
    const rawIdempotencyKey = text(request.headers.get('idempotency-key') ?? body.idempotencyKey ?? body.idempotency_key)
    let profileRunId = text(body.profileRunId)
    if (!datasetVersionId) return NextResponse.json({ error: 'datasetVersionId is required.' }, { status: 400 })

    const { dataset, version } = await authorizeDatasetVersion(user.id, datasetVersionId, 'quality.execute')
    const admin = createAdminClient()
    const enabledRuleCount = await enabledQualityRuleCount(admin, dataset.id, version.id)
    if (enabledRuleCount === 0) {
      return NextResponse.json({ error: 'No enabled quality rules apply to this dataset version.' }, { status: 409 })
    }

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
    return errorResponse(error)
  }
}
