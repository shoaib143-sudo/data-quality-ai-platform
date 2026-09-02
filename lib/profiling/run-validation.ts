import { createAdminClient } from '@/lib/supabase/admin'

export type ProfilingRunValidation = {
  valid: boolean
  profiling_run_id: string
  dataset_version_id: string
  status: string
  contract: {
    enabled_metric_definitions: number
    persisted_metric_definitions: number
    missing_metric_definitions: string[]
    unknown_metric_definition_ids: string[]
    duplicate_metric_keys: string[]
    metric_key_mismatches: string[]
    complete: boolean
  }
  persistence: {
    metric_rows: number
    finding_rows: number
    quality_score_present: boolean
    investigation_present: boolean
    atomic_result_state_complete: boolean
  }
  score: Record<string, unknown> | null
  warnings: string[]
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export async function validateProfilingRun(
  profilingRunId: string,
  userId: string,
): Promise<ProfilingRunValidation> {
  if (!profilingRunId) throw new Error('profilingRunId is required')
  if (!userId) throw new Error('userId is required')

  const supabase = createAdminClient()

  const { data: run, error: runError } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .select('id, dataset_version_id, status, summary')
    .eq('id', profilingRunId)
    .maybeSingle()

  if (runError) throw new Error(`Unable to load profiling run: ${runError.message}`)
  if (!run) throw new Error(`Profiling run ${profilingRunId} was not found.`)

  const { data: version, error: versionError } = await supabase
    .schema('catalog')
    .from('dataset_versions')
    .select('id, dataset_id')
    .eq('id', run.dataset_version_id)
    .maybeSingle()
  if (versionError) throw new Error(`Unable to resolve dataset version: ${versionError.message}`)
  if (!version) throw new Error(`Dataset version ${run.dataset_version_id} was not found.`)

  const { data: dataset, error: datasetError } = await supabase
    .schema('catalog')
    .from('datasets')
    .select('id, project_id')
    .eq('id', version.dataset_id)
    .maybeSingle()
  if (datasetError) throw new Error(`Unable to resolve dataset ownership: ${datasetError.message}`)
  if (!dataset) throw new Error(`Dataset ${version.dataset_id} was not found.`)

  const { data: project, error: projectError } = await supabase
    .schema('app')
    .from('projects')
    .select('id, organization_id')
    .eq('id', dataset.project_id)
    .maybeSingle()
  if (projectError) throw new Error(`Unable to resolve project ownership: ${projectError.message}`)
  if (!project) throw new Error(`Project ${dataset.project_id} was not found.`)

  const { data: membership, error: membershipError } = await supabase
    .schema('app')
    .from('organization_members')
    .select('organization_id, role')
    .eq('organization_id', project.organization_id)
    .eq('user_id', userId)
    .maybeSingle()
  if (membershipError) throw new Error(`Unable to verify project access: ${membershipError.message}`)
  if (!membership) throw new Error('You do not have access to this profiling run.')

  const { data: definitions, error: definitionError } = await supabase
    .schema('profiling')
    .from('metric_definitions')
    .select('id, metric_key, scope')
    .eq('enabled', true)
    .order('scope')
    .order('metric_key')
  if (definitionError) throw new Error(`Unable to load metric contract: ${definitionError.message}`)

  const { data: metrics, error: metricsError } = await supabase
    .schema('profiling')
    .from('profile_metrics')
    .select('id, metric_definition_id, metric_key')
    .eq('profile_run_id', profilingRunId)
  if (metricsError) throw new Error(`Unable to load persisted metrics: ${metricsError.message}`)

  const definitionRows = definitions ?? []
  const metricRows = metrics ?? []
  const definitionById = new Map(definitionRows.map((definition) => [definition.id, definition]))
  const persistedDefinitionIds = new Set(metricRows.map((metric) => metric.metric_definition_id))
  const missingMetricDefinitions = definitionRows
    .filter((definition) => !persistedDefinitionIds.has(definition.id))
    .map((definition) => `${definition.scope}:${definition.metric_key}`)
  const unknownMetricDefinitionIds = Array.from(persistedDefinitionIds)
    .filter((definitionId) => !definitionById.has(definitionId))
    .sort()
  const counts = new Map<string, number>()
  const metricKeyMismatches: string[] = []
  for (const metric of metricRows) {
    const definition = definitionById.get(metric.metric_definition_id)
    const key = definition
      ? `${definition.scope}:${definition.metric_key}`
      : `UNKNOWN:${metric.metric_key}`
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (definition && definition.metric_key !== metric.metric_key) {
      metricKeyMismatches.push(`${definition.scope}:${definition.metric_key} persisted_as:${metric.metric_key}`)
    }
  }
  const duplicateMetricKeys = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort()
  metricKeyMismatches.sort()

  const { count: findingRows, error: findingsError } = await supabase
    .schema('profiling')
    .from('profile_findings')
    .select('id', { count: 'exact', head: true })
    .eq('profile_run_id', profilingRunId)
  if (findingsError) throw new Error(`Unable to load profiling findings: ${findingsError.message}`)

  const { data: score, error: scoreError } = await supabase
    .schema('profiling')
    .from('data_quality_scores')
    .select('completeness_score, uniqueness_score, validity_score, accuracy_score, overall_score')
    .eq('profile_run_id', profilingRunId)
    .maybeSingle()
  if (scoreError) throw new Error(`Unable to load quality score: ${scoreError.message}`)

  const summary = asRecord(run.summary)
  const investigation = asRecord(summary.investigation)
  const investigationPresent = Object.keys(investigation).length > 0
  const contractComplete = missingMetricDefinitions.length === 0
    && unknownMetricDefinitionIds.length === 0
    && duplicateMetricKeys.length === 0
    && metricKeyMismatches.length === 0
    && metricRows.length === definitionRows.length
  const atomicResultStateComplete = metricRows.length > 0 && Boolean(score) && run.status === 'COMPLETED'
  const warnings: string[] = []

  if (!contractComplete) warnings.push('Persisted metrics do not exactly match the currently enabled metric contract.')
  if (unknownMetricDefinitionIds.length) warnings.push(`Persisted metrics reference ${unknownMetricDefinitionIds.length} definition ID(s) that are not currently enabled.`)
  if (metricKeyMismatches.length) warnings.push('One or more persisted metric keys do not match their metric definitions.')
  if (run.status === 'COMPLETED' && !atomicResultStateComplete) warnings.push('Run is marked COMPLETED but its persisted metric or score state is incomplete.')
  if (run.status === 'COMPLETED' && !investigationPresent) warnings.push('Run is completed without a persisted investigation outcome.')
  if (metricRows.length !== definitionRows.length) warnings.push(`Persisted metric row count is ${metricRows.length}; enabled definition count is ${definitionRows.length}.`)

  return {
    valid: run.status === 'COMPLETED' && contractComplete && atomicResultStateComplete && investigationPresent,
    profiling_run_id: run.id,
    dataset_version_id: run.dataset_version_id,
    status: run.status,
    contract: {
      enabled_metric_definitions: definitionRows.length,
      persisted_metric_definitions: persistedDefinitionIds.size,
      missing_metric_definitions: missingMetricDefinitions,
      unknown_metric_definition_ids: unknownMetricDefinitionIds,
      duplicate_metric_keys: duplicateMetricKeys,
      metric_key_mismatches: metricKeyMismatches,
      complete: contractComplete,
    },
    persistence: {
      metric_rows: metricRows.length,
      finding_rows: findingRows ?? 0,
      quality_score_present: Boolean(score),
      investigation_present: investigationPresent,
      atomic_result_state_complete: atomicResultStateComplete,
    },
    score: score ?? null,
    warnings,
  }
}
