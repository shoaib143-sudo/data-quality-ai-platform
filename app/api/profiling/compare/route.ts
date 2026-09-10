import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth/require-api-user'
import { authorizeProject, authorizationErrorResponse } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'
import { compareProfiles } from '@/lib/profiling/derived-tools'
import { writeGovernanceAudit } from '@/lib/governance/audit'

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

async function profileContext(profileRunId: string) {
  const admin = createAdminClient()
  const { data: run, error: runError } = await admin.schema('profiling').from('profile_runs').select('id,dataset_version_id,status').eq('id', profileRunId).maybeSingle()
  if (runError || !run) return null
  const { data: version } = await admin.schema('catalog').from('dataset_versions').select('id,dataset_id').eq('id', run.dataset_version_id).maybeSingle()
  if (!version) return null
  const { data: dataset } = await admin.schema('catalog').from('datasets').select('id,project_id').eq('id', version.dataset_id).maybeSingle()
  if (!dataset) return null
  return { run, version, dataset }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    const body = await request.json()
    const baselineProfileRunId = text(body.baselineProfileRunId)
    const targetProfileRunId = text(body.targetProfileRunId)
    if (!baselineProfileRunId || !targetProfileRunId || baselineProfileRunId === targetProfileRunId) {
      return NextResponse.json({ error: 'Distinct baselineProfileRunId and targetProfileRunId are required.' }, { status: 400 })
    }

    const [baseline, target] = await Promise.all([profileContext(baselineProfileRunId), profileContext(targetProfileRunId)])
    if (!baseline || !target) return NextResponse.json({ error: 'One or both profile runs are unavailable.' }, { status: 404 })

    await Promise.all([
      authorizeProject(user.id, baseline.dataset.project_id, 'profiling.read'),
      authorizeProject(user.id, target.dataset.project_id, 'profiling.read'),
    ])

    if (baseline.dataset.id !== target.dataset.id) return NextResponse.json({ error: 'Profile comparison requires runs from the same dataset.' }, { status: 400 })
    if (String(baseline.run.status) !== 'COMPLETED' || String(target.run.status) !== 'COMPLETED') return NextResponse.json({ error: 'Only completed profiling runs can be compared.' }, { status: 409 })

    const result = await compareProfiles(baselineProfileRunId, targetProfileRunId)
    await writeGovernanceAudit({ projectId: target.dataset.project_id, actorUserId: user.id, eventType: 'PROFILE_COMPARISON_CREATED', entityType: 'DATASET', entityId: target.dataset.id, metadata: { baseline_profile_run_id: baselineProfileRunId, target_profile_run_id: targetProfileRunId, comparison_id: (result as Record<string, unknown>).comparison_id ?? null } })
    return NextResponse.json({ comparison: result }, { status: 201 })
  } catch (error) {
    const authError = authorizationErrorResponse(error)
    if (authError) return NextResponse.json({ error: authError.error }, { status: authError.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to compare profiling runs.' }, { status: 500 })
  }
}
