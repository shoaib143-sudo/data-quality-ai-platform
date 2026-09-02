import { createAdminClient } from '@/lib/supabase/admin'

export type ProfilingRunValidation = {
  valid: boolean
  profiling_run_id: string
  dataset_version_id: string
  status: string
  contract: {
    enabled_metric_definitions: number
    expected_metric_identities: number
    persisted_metric_identities: number
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

function identityKey(metricDefinitionId: string, profileColumnId: string | null) {
  return `${metricDefinitionId}:${profileColumnId ?? 'DATASET'}`
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

  const { data: profileColumns, error: columnsError } = await supabase
    .schema('profiling')
    .from('profile_columns')
    .select('id, column_name')
    .eq('profile_run_id', profilingRunId)
    .order('column_name')
  if (columnsError) throw new Error(`Unable to load profile columns: ${columnsError.message}`)

  const { data: metrics, error: metricsError } = await supabase
    .schema('profiling')
    .from('profile_metrics')
    .select('id, metric_definition_id, profile_column_id, metric_key')
    .eq('profile_run_id', profilingRunId)
  if (metricsError) throw new Error(`Unable to load persisted metrics: ${metricsError.message}`)

  const definitionRows = definitions ?? []
  const profileColumnRows = profileColumns ?? []
  const metricRows = metrics ?? []
  const definitionById = new Map(definitionRows.map((definition) => [definition.id, definition]))
  const columnIds = profileColumnRows.map((column) => column.id)

  const expectedIdentities = new Set<string>()
  for (const definition of definitionRows) {
    if (definition.scope === 'DATASET') expectedIdentities.add(identityKey(definition.id, null))
    else for (const columnId of columnIds) expectedIdentities.add(identityKey(definition.id, columnId))
  }

  const persistedIdentityCounts = new Map<string, number>()
  const persistedIdentitySet = new Set<string>()
  const persistedDefinitionIds = new Set<string>()
  const duplicateMetricKeys: string[] = []
  const metricKeyMismatches: string[] = []
  for (const metric of metricRows) {
    persistedDefinitionIds.add(metric.metric_definition_id)
    const identity = identityKey(metric.metric_definition_id, metric.profile_column_id)
    persistedIdentitySet.add(identity)
    persistedIdentityCounts.set(identity, (persistedIdentityCounts.get(identity) ?? 0) + 1)
    const definition = definitionById.get(metric.metric_definition_id)
    if (!definition) continue
    const expectedColumnScope = definition.scope === 'DATASET' ? metric.profile_column_id === null : Boolean(metric.profile_column_id)
    if (!expectedColumnScope) duplicateMetricKeys.push(`${definition.scope}:${definition.metric_key}:INVALID_COLUMN_SCOPE`)
    if (definition.metric_key !== metric.metric_key) metricKeyMismatches.push(`${definition.scope}:${definition.metric_key} persisted_as:${metric.metric_key}`)
    if (metric.profile_column_id && !columnIds.includes(metric.profile_column_id)) duplicateMetricKeys.push(`${definition.scope}:${definition.metric_key}:UNKNOWN_PROFILE_COLUMN:${metric.profile_column_id}`)
  }

  for (const [identity, count] of persistedIdentityCounts) {
    if (count > 1) duplicateMetricKeys.push(`DUPLICATE:${identity}`)
  }
  const missingIdentities = Array.from(expectedIdentities).filter((identity) => !persistedIdentitySet.has(identity))
  const missingMetricDefinitions = definitionRows
    .filter((definition) => missingIdentities.some((identity) => identity.startsWith(`${definition.id}:`)))
    .map((definition) => `${definition.scope}:${definition.metric_key}`)
  const unknownMetricDefinitionIds = Array.from(persistedDefinitionIds)
    .filter((definitionId) => !definitionById.has(definitionId))
    .sort()
  const duplicateKeys = Array.from(new Set(duplicateMetricKeys)).sort()
  const metricKeyMismatchList = Array.from(new Set(metricKeyMismatches)).sort()

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
  const expectedMetricIdentities = expectedIdentities.size
  const persistedMetricIdentities = persistedIdentitySet.size
  const contractComplete = missingIdentities.length === 0
    && unknownMetricDefinitionIds.length === 0
    && duplicateKeys.length === 0
    && metricKeyMismatchList.length === 0
    && persistedMetricIdentities === expectedMetricIdentities
  const atomicResultStateComplete = contractComplete && Boolean(score) && run.status === 'COMPLETED'
  const warnings: string[] = []

  if (!contractComplete) warnings.push('Persisted metrics do not exactly match the enabled metric execution identity contract.')
  if (unknownMetricDefinitionIds.length) warnings.push(`Persisted metrics reference ${unknownMetricDefinitionIds.length} definition ID(s) that are not currently enabled.`)
  if (metricKeyMismatchList.length) warnings.push('One or more persisted metric keys do not match their metric definitions.')
  if (run.status === 'COMPLETED' && !atomicResultStateComplete) warnings.push('Run is marked COMPLETED but its persisted metric or score state is incomplete.')
  if (run.status === 'COMPLETED' && !investigationPresent) warnings.push('Run is completed without a persisted investigation outcome.')
  if (metricRows.length !== expectedMetricIdentities) warnings.push(`Persisted metric row count is ${metricRows.length}; expected identity count is ${expectedMetricIdentities}.`)

  return {
    valid: run.status === 'COMPLETED' && contractComplete && atomicResultStateComplete && investigationPresent,
    profiling_run_id: run.id,
    dataset_version_id: run.dataset_version_id,
    status: run.status,
    contract: {
      enabled_metric_definitions: definitionRows.length,
      expected_metric_identities: expectedMetricIdentities,
      persisted_metric_identities: persistedMetricIdentities,
      persisted_metric_definitions: persistedDefinitionIds.size,
      missing_metric_definitions: Array.from(new Set(missingMetricDefinitions)).sort(),
      unknown_metric_definition_ids: unknownMetricDefinitionIds,
      duplicate_metric_keys: duplicateKeys,
      metric_key_mismatches: metricKeyMismatchList,
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
