import { createAdminClient } from '@/lib/supabase/admin'

type Severity = 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
type Category = 'QUALITY_SCORE_DROP' | 'SCHEMA_DRIFT' | 'VOLUME_CHANGE' | 'QUALITY_RULE_FAILURE' | 'PROFILE_FAILURE'

type AlertCandidate = {
  category: Category
  severity: Severity
  title: string
  description: string
  fingerprint: string
  evidence: Record<string, unknown>
}

async function upsertAlert(input: {
  projectId: string
  datasetId: string
  datasetVersionId: string
  profileRunId: string
  candidate: AlertCandidate
}) {
  const admin = createAdminClient()
  const now = new Date().toISOString()
  const { data: existing, error: existingError } = await admin
    .schema('profiling')
    .from('observability_alerts')
    .select('id,status,first_observed_at')
    .eq('project_id', input.projectId)
    .eq('fingerprint', input.candidate.fingerprint)
    .maybeSingle()
  if (existingError) throw new Error(`Unable to resolve observability alert: ${existingError.message}`)

  const payload = {
    project_id: input.projectId,
    dataset_id: input.datasetId,
    dataset_version_id: input.datasetVersionId,
    profile_run_id: input.profileRunId,
    category: input.candidate.category,
    severity: input.candidate.severity,
    title: input.candidate.title,
    description: input.candidate.description,
    fingerprint: input.candidate.fingerprint,
    evidence: input.candidate.evidence,
    status: 'OPEN',
    last_observed_at: now,
    resolved_at: null,
    updated_at: now,
  }

  if (existing) {
    const { error } = await admin.schema('profiling').from('observability_alerts').update(payload).eq('id', existing.id)
    if (error) throw new Error(`Unable to update observability alert: ${error.message}`)
    return
  }
  const { error } = await admin.schema('profiling').from('observability_alerts').insert(payload)
  if (error) throw new Error(`Unable to create observability alert: ${error.message}`)
}

async function resolveMissingCategories(projectId: string, datasetId: string, activeCategories: Set<Category>) {
  const admin = createAdminClient()
  const categories: Category[] = ['QUALITY_SCORE_DROP','SCHEMA_DRIFT','VOLUME_CHANGE','QUALITY_RULE_FAILURE','PROFILE_FAILURE']
  const now = new Date().toISOString()
  for (const category of categories) {
    if (activeCategories.has(category)) continue
    await admin.schema('profiling').from('observability_alerts').update({
      status: 'RESOLVED',
      resolved_at: now,
      updated_at: now,
    }).eq('project_id', projectId).eq('dataset_id', datasetId).eq('category', category).neq('status', 'RESOLVED')
  }
}

export async function evaluateObservabilitySignals(datasetVersionId: string, profileRunId: string) {
  const admin = createAdminClient()
  const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions').select('id,dataset_id,version_number').eq('id', datasetVersionId).maybeSingle()
  if (versionError || !version) throw new Error(`Unable to resolve observability dataset version: ${versionError?.message ?? 'not found'}`)
  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').select('id,project_id,name').eq('id', version.dataset_id).maybeSingle()
  if (datasetError || !dataset) throw new Error(`Unable to resolve observability dataset: ${datasetError?.message ?? 'not found'}`)

  const { data: versions, error: versionsError } = await admin.schema('catalog').from('dataset_versions').select('id').eq('dataset_id', dataset.id)
  if (versionsError) throw new Error(`Unable to load dataset versions for observability: ${versionsError.message}`)
  const versionIds = (versions ?? []).map((row) => row.id)

  const { data: runs, error: runsError } = versionIds.length
    ? await admin.schema('profiling').from('profile_runs').select('id,dataset_version_id,row_count,column_count,schema_hash,started_at,completed_at').in('dataset_version_id', versionIds).eq('status','COMPLETED').order('started_at',{ ascending:false }).limit(2)
    : { data: [], error: null }
  if (runsError) throw new Error(`Unable to load profile history for observability: ${runsError.message}`)
  const current = (runs ?? []).find((run) => run.id === profileRunId) ?? runs?.[0]
  const previous = (runs ?? []).find((run) => run.id !== current?.id)

  const runIds = [current?.id, previous?.id].filter((value): value is string => Boolean(value))
  const { data: scores, error: scoresError } = runIds.length
    ? await admin.schema('profiling').from('data_quality_scores').select('profile_run_id,overall_score').in('profile_run_id', runIds)
    : { data: [], error: null }
  if (scoresError) throw new Error(`Unable to load score history for observability: ${scoresError.message}`)
  const scoreByRun = new Map((scores ?? []).map((score) => [score.profile_run_id, score.overall_score]))

  const { data: qualityResults, error: qualityError } = await admin
    .schema('profiling')
    .from('quality_rule_runs')
    .select('id,status,rule_definition_id,observed_value,threshold,quality_rule_definitions(name,severity,column_name,metric_key)')
    .eq('profile_run_id', profileRunId)
  if (qualityError) throw new Error(`Unable to load quality controls for observability: ${qualityError.message}`)

  const candidates: AlertCandidate[] = []
  if (current && previous) {
    const currentScore = scoreByRun.get(current.id)
    const previousScore = scoreByRun.get(previous.id)
    if (typeof currentScore === 'number' && typeof previousScore === 'number') {
      const drop = previousScore - currentScore
      if (drop >= 0.1) {
        candidates.push({
          category: 'QUALITY_SCORE_DROP',
          severity: drop >= 0.2 ? 'HIGH' : 'MEDIUM',
          title: `${dataset.name} quality score declined materially`,
          description: `Overall quality declined by ${Math.round(drop * 100)} percentage points compared with the previous completed profile.`,
          fingerprint: `quality-score-drop:${dataset.id}`,
          evidence: { current_profile_run_id: current.id, previous_profile_run_id: previous.id, current_score: currentScore, previous_score: previousScore, absolute_drop: drop },
        })
      }
    }

    if (current.schema_hash && previous.schema_hash && current.schema_hash !== previous.schema_hash) {
      candidates.push({
        category: 'SCHEMA_DRIFT',
        severity: 'HIGH',
        title: `${dataset.name} schema changed`,
        description: 'The persisted schema fingerprint differs from the previous completed profile and should be reviewed for downstream compatibility.',
        fingerprint: `schema-drift:${dataset.id}`,
        evidence: { current_profile_run_id: current.id, previous_profile_run_id: previous.id, current_schema_hash: current.schema_hash, previous_schema_hash: previous.schema_hash, current_column_count: current.column_count, previous_column_count: previous.column_count },
      })
    }

    if (typeof current.row_count === 'number' && typeof previous.row_count === 'number' && previous.row_count > 0) {
      const change = (current.row_count - previous.row_count) / previous.row_count
      if (Math.abs(change) >= 0.5) {
        candidates.push({
          category: 'VOLUME_CHANGE',
          severity: Math.abs(change) >= 0.8 ? 'HIGH' : 'MEDIUM',
          title: `${dataset.name} row volume changed materially`,
          description: `Row volume changed by ${Math.round(change * 100)}% compared with the previous completed profile.`,
          fingerprint: `volume-change:${dataset.id}`,
          evidence: { current_profile_run_id: current.id, previous_profile_run_id: previous.id, current_row_count: current.row_count, previous_row_count: previous.row_count, relative_change: change },
        })
      }
    }
  }

  const failedRules = (qualityResults ?? []).filter((result) => result.status === 'FAILED')
  if (failedRules.length) {
    const highFailures = failedRules.filter((result) => {
      const definition = Array.isArray(result.quality_rule_definitions) ? result.quality_rule_definitions[0] : result.quality_rule_definitions
      return ['HIGH','CRITICAL'].includes(String(definition?.severity ?? '').toUpperCase())
    })
    candidates.push({
      category: 'QUALITY_RULE_FAILURE',
      severity: highFailures.length ? 'HIGH' : 'MEDIUM',
      title: `${dataset.name} has failing data quality controls`,
      description: `${failedRules.length} automated quality control${failedRules.length === 1 ? '' : 's'} failed on the latest profiling evidence.`,
      fingerprint: `quality-rule-failure:${dataset.id}`,
      evidence: {
        profile_run_id: profileRunId,
        failed_rule_count: failedRules.length,
        high_or_critical_rule_count: highFailures.length,
        failed_rules: failedRules.slice(0, 20).map((result) => {
          const definition = Array.isArray(result.quality_rule_definitions) ? result.quality_rule_definitions[0] : result.quality_rule_definitions
          return { name: definition?.name, column_name: definition?.column_name, metric_key: definition?.metric_key, severity: definition?.severity, observed_value: result.observed_value, threshold: result.threshold }
        }),
      },
    })
  }

  for (const candidate of candidates) {
    await upsertAlert({ projectId: dataset.project_id, datasetId: dataset.id, datasetVersionId, profileRunId, candidate })
  }
  await resolveMissingCategories(dataset.project_id, dataset.id, new Set(candidates.map((candidate) => candidate.category)))

  return { datasetId: dataset.id, profileRunId, alerts: candidates }
}


export async function recordProfileFailureAlert(datasetVersionId: string, profileRunId: string, message: string) {
  const admin = createAdminClient()
  const { data: version, error: versionError } = await admin.schema('catalog').from('dataset_versions').select('id,dataset_id').eq('id', datasetVersionId).maybeSingle()
  if (versionError || !version) throw new Error(`Unable to resolve failed profiling dataset version: ${versionError?.message ?? 'not found'}`)
  const { data: dataset, error: datasetError } = await admin.schema('catalog').from('datasets').select('id,project_id,name').eq('id', version.dataset_id).maybeSingle()
  if (datasetError || !dataset) throw new Error(`Unable to resolve failed profiling dataset: ${datasetError?.message ?? 'not found'}`)

  await upsertAlert({
    projectId: dataset.project_id,
    datasetId: dataset.id,
    datasetVersionId,
    profileRunId,
    candidate: {
      category: 'PROFILE_FAILURE' as Category,
      severity: 'HIGH',
      title: `${dataset.name} profiling execution failed`,
      description: 'The latest profiling execution failed before producing a fully validated governance evidence set.',
      fingerprint: `profile-failure:${dataset.id}`,
      evidence: { profile_run_id: profileRunId, dataset_version_id: datasetVersionId, error_message: message },
    },
  })
}
