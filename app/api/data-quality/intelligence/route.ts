import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/auth/require-user'
import { authorizeProject, AuthorizationError } from '@/lib/auth/authorize'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

async function resolveDataset(projectId: string, datasetId: string) {
  const admin = createAdminClient()
  const { data: dataset, error } = await admin
    .schema('catalog')
    .from('datasets')
    .select('id,project_id,name,business_domain')
    .eq('id', datasetId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) throw new Error(`Unable to resolve quality intelligence dataset: ${error.message}`)
  return { admin, dataset }
}

export async function GET(request: Request) {
  try {
    const user = await requireUser()
    const url = new URL(request.url)
    const projectId = text(url.searchParams.get('projectId'))
    const datasetId = text(url.searchParams.get('datasetId'))
    if (!projectId || !datasetId) {
      return NextResponse.json({ error: 'projectId and datasetId are required.' }, { status: 400 })
    }

    await authorizeProject(user.id, projectId, 'quality.read')
    const { admin, dataset } = await resolveDataset(projectId, datasetId)
    if (!dataset) return NextResponse.json({ error: 'Dataset not found in project.' }, { status: 404 })

    const { data: versions, error: versionsError } = await admin
      .schema('catalog')
      .from('dataset_versions')
      .select('id,version_number,status')
      .eq('dataset_id', datasetId)
    if (versionsError) throw new Error(`Unable to resolve dataset versions: ${versionsError.message}`)
    const versionIds = (versions ?? []).map((version) => version.id)

    const { data: latestRun, error: latestRunError } = versionIds.length
      ? await admin
          .schema('profiling')
          .from('profile_runs')
          .select('id,dataset_version_id,status,started_at,completed_at,row_count,column_count,schema_hash')
          .in('dataset_version_id', versionIds)
          .eq('status', 'COMPLETED')
          .order('completed_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null, error: null }
    if (latestRunError) throw new Error(`Unable to resolve latest completed profile: ${latestRunError.message}`)

    if (!latestRun) {
      return NextResponse.json({
        projectId,
        dataset,
        latestProfileRun: null,
        qualityRuleRuns: [],
        comparisons: [],
        anomalies: [],
        alerts: [],
        score: null,
      })
    }

    const [rules, comparisons, anomalies, alerts, score] = await Promise.all([
      admin
        .schema('profiling')
        .from('quality_rule_runs')
        .select('id,status,passed,observed_value,threshold,evidence,error_message,started_at,completed_at,agent_run_id,quality_rule_definitions(rule_key,name,severity,column_name,metric_key,dimension,operator)')
        .eq('profile_run_id', latestRun.id)
        .order('started_at', { ascending: false }),
      admin
        .schema('profiling')
        .from('profile_comparisons')
        .select('id,baseline_profile_run_id,comparison_type,status,summary,changes,metrics_changed,anomalies_found,created_at')
        .eq('current_profile_run_id', latestRun.id)
        .order('created_at', { ascending: false })
        .limit(10),
      admin
        .schema('profiling')
        .from('profile_anomalies')
        .select('id,profile_column_id,anomaly_type,severity,metric_key,current_value,baseline_value,absolute_change,relative_change,direction,title,description,evidence,detected_by,created_at')
        .eq('profile_run_id', latestRun.id)
        .order('created_at', { ascending: false })
        .limit(100),
      admin
        .schema('profiling')
        .from('observability_alerts')
        .select('id,category,severity,title,description,status,evidence,first_observed_at,last_observed_at,resolved_at')
        .eq('project_id', projectId)
        .eq('dataset_id', datasetId)
        .order('last_observed_at', { ascending: false })
        .limit(50),
      admin
        .schema('profiling')
        .from('data_quality_scores')
        .select('id,overall_score,dimension_scores,explanation,created_at')
        .eq('profile_run_id', latestRun.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    for (const [label, result] of [
      ['quality rule runs', rules],
      ['profile comparisons', comparisons],
      ['profile anomalies', anomalies],
      ['observability alerts', alerts],
      ['quality score', score],
    ] as const) {
      if (result.error) throw new Error(`Unable to load ${label}: ${result.error.message}`)
    }

    const ruleRows = rules.data ?? []
    const failedRules = ruleRows.filter((row) => row.status === 'FAILED').length
    const unavailableRules = ruleRows.filter((row) => row.status === 'ERROR').length
    const openAlerts = (alerts.data ?? []).filter((row) => row.status !== 'RESOLVED')

    return NextResponse.json({
      projectId,
      dataset,
      latestProfileRun: latestRun,
      score: score.data ?? null,
      summary: {
        rulesEvaluated: ruleRows.length,
        failedRules,
        unavailableRules,
        anomalies: (anomalies.data ?? []).length,
        openAlerts: openAlerts.length,
        freshnessBreached: openAlerts.some((row) => row.category === 'FRESHNESS'),
      },
      qualityRuleRuns: ruleRows,
      comparisons: comparisons.data ?? [],
      anomalies: anomalies.data ?? [],
      alerts: alerts.data ?? [],
    })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load quality intelligence.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = await request.json().catch(() => ({}))
    const projectId = text(body.projectId)
    const profileRunId = text(body.profileRunId)
    if (!projectId) return NextResponse.json({ error: 'projectId is required.' }, { status: 400 })

    await authorizeProject(user.id, projectId, 'quality.execute')
    const admin = createAdminClient()

    if (profileRunId) {
      const { data: run, error: runError } = await admin
        .schema('profiling')
        .from('profile_runs')
        .select('id,dataset_version_id,status')
        .eq('id', profileRunId)
        .eq('status', 'COMPLETED')
        .maybeSingle()
      if (runError || !run) return NextResponse.json({ error: 'Completed profile run not found.' }, { status: 404 })

      const { data: version, error: versionError } = await admin
        .schema('catalog')
        .from('dataset_versions')
        .select('id,dataset_id')
        .eq('id', run.dataset_version_id)
        .maybeSingle()
      if (versionError || !version) return NextResponse.json({ error: 'Dataset version not found.' }, { status: 404 })

      const { data: dataset, error: datasetError } = await admin
        .schema('catalog')
        .from('datasets')
        .select('id,project_id')
        .eq('id', version.dataset_id)
        .eq('project_id', projectId)
        .maybeSingle()
      if (datasetError || !dataset) return NextResponse.json({ error: 'Profile run is outside the authorized project.' }, { status: 403 })

      const { data, error } = await admin.schema('profiling').rpc('evaluate_profile_quality_intelligence', {
        p_profile_run_id: profileRunId,
      })
      if (error) throw new Error(`Unable to evaluate profile quality intelligence: ${error.message}`)
      return NextResponse.json({ action: 'PROFILE_EVALUATED', result: data })
    }

    const { data, error } = await admin.schema('profiling').rpc('refresh_quality_intelligence', {
      p_project_id: projectId,
      p_limit: 200,
    })
    if (error) throw new Error(`Unable to refresh project quality intelligence: ${error.message}`)
    return NextResponse.json({ action: 'PROJECT_REFRESHED', result: data })
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.json({ error: error.message }, { status: error.status })
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to refresh quality intelligence.' }, { status: 500 })
  }
}
