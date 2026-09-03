import { after, NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { createAdminClient } from '@/lib/supabase/admin'
import { executeQualityAutomation } from '@/lib/data-quality/automation'
import { evaluateObservabilitySignals } from '@/lib/observability/evaluate'

export const maxDuration = 300

function text(value: unknown) { return typeof value === 'string' ? value.trim() : '' }

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json()
    const datasetVersionId = text(body.datasetVersionId)
    let profileRunId = text(body.profileRunId)
    if (!datasetVersionId) return NextResponse.json({ error: 'datasetVersionId is required.' }, { status: 400 })

    const admin = createAdminClient()
    const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions').select('id,dataset_id').eq('id', datasetVersionId).maybeSingle()
    if (versionError || !version) return NextResponse.json({ error: 'Dataset version was not found.' }, { status: 404 })
    const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').select('id,project_id').eq('id', version.dataset_id).maybeSingle()
    if (datasetError || !dataset) return NextResponse.json({ error: 'Dataset was not found.' }, { status: 404 })
    const { data: project } = await admin.schema('app').from('projects').select('id,organization_id').eq('id', dataset.project_id).maybeSingle()
    if (!project) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })
    const { data: membership } = await admin.schema('app').from('organization_members').select('role').eq('organization_id', project.organization_id).eq('user_id', user.id).maybeSingle()
    if (!membership || !['OWNER','ADMIN','MEMBER'].includes(String(membership.role))) return NextResponse.json({ error: 'Project access denied.' }, { status: 403 })

    if (!profileRunId) {
      const { data: latestRun, error: runError } = await admin.schema('profiling').from('profile_runs').select('id,status').eq('dataset_version_id', datasetVersionId).eq('status', 'COMPLETED').order('started_at', { ascending: false }).limit(1).maybeSingle()
      if (runError) throw new Error(`Unable to resolve latest completed profile: ${runError.message}`)
      if (!latestRun) return NextResponse.json({ error: 'A completed profiling run is required before quality rules can execute.' }, { status: 409 })
      profileRunId = latestRun.id
    } else {
      const { data: run } = await admin.schema('profiling').from('profile_runs').select('id,status').eq('id', profileRunId).eq('dataset_version_id', datasetVersionId).maybeSingle()
      if (!run || run.status !== 'COMPLETED') return NextResponse.json({ error: 'The selected profiling run is unavailable or incomplete.' }, { status: 409 })
    }

    const { data: agentDefinition, error: agentError } = await admin.schema('agent').from('agent_definitions').select('id,version').eq('agent_key','data_quality_agent').eq('version','1.0').eq('enabled',true).maybeSingle()
    if (agentError || !agentDefinition) return NextResponse.json({ error: 'Data Quality Agent 1.0 is not enabled.' }, { status: 503 })

    const { data: run, error: runError } = await admin.schema('agent').from('agent_runs').insert({
      agent_definition_id: agentDefinition.id,
      project_id: dataset.project_id,
      dataset_id: dataset.id,
      dataset_version_id: datasetVersionId,
      status: 'QUEUED',
      input: { datasetVersionId, profileRunId, automation: true, requested_by_user: true },
    }).select('id').single()
    if (runError || !run) throw new Error(`Unable to queue data quality job: ${runError?.message ?? 'unknown error'}`)

    const agentRunId = run.id
    const resolvedProfileRunId = profileRunId
    after(async () => {
      try {
        await executeQualityAutomation({
          datasetVersionId,
          profileRunId: resolvedProfileRunId,
          userId: user.id,
          existingAgentRunId: agentRunId,
        })
        await evaluateObservabilitySignals(datasetVersionId, resolvedProfileRunId)
      } catch (error) {
        console.error('[data-quality-job] background execution failed', error)
      }
    })

    return NextResponse.json({
      accepted: true,
      execution_completed: false,
      agentRunId,
      profileRunId: resolvedProfileRunId,
      monitorUrl: `/monitoring?run=${encodeURIComponent(agentRunId)}`,
    }, { status: 202 })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Data quality automation failed.' }, { status: 500 })
  }
}
