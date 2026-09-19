import { createClient } from '@supabase/supabase-js'
import { evaluateProfilingProductionSnapshot } from './lib/profiling-production-validation.mjs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const required = process.env.PROFILING_PRODUCTION_VALIDATION_REQUIRED === 'true'

if (!url || !serviceRoleKey) {
  const message = 'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required for live profiling production validation.'
  if (required) throw new Error(message)
  console.log(`SKIP ${message}`)
  process.exit(0)
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

async function countRows(schema, table, column, value) {
  let query = supabase.schema(schema).from(table).select('id', { count: 'exact', head: true })
  if (column) query = query.eq(column, value)
  const { count, error } = await query
  if (error) throw new Error(`Unable to count ${schema}.${table}: ${error.message}`)
  return count ?? 0
}

const profileRuns = await countRows('profiling', 'profile_runs')
const completedRuns = await countRows('profiling', 'profile_runs', 'status', 'COMPLETED')

const completed = []
const pageSize = 500
for (let from = 0; ; from += pageSize) {
  const { data: page, error } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .select('id,dataset_version_id,status,summary,completed_at,started_at')
    .eq('status', 'COMPLETED')
    .order('completed_at', { ascending: false, nullsFirst: false })
    .order('started_at', { ascending: false, nullsFirst: false })
    .range(from, from + pageSize - 1)
  if (error) throw new Error(`Unable to enumerate completed profile runs: ${error.message}`)
  completed.push(...(page ?? []))
  if (!page || page.length < pageSize) break
}

const latestByDatasetVersion = new Map()
for (const run of completed) {
  if (!run.dataset_version_id || latestByDatasetVersion.has(run.dataset_version_id)) continue
  latestByDatasetVersion.set(run.dataset_version_id, run)
}

const latestAttemptsByDatasetVersion = new Map()
const allRuns = []
for (let from = 0; ; from += pageSize) {
  const { data: page, error } = await supabase
    .schema('profiling')
    .from('profile_runs')
    .select('id,dataset_version_id,status,error_code,started_at,completed_at')
    .order('started_at', { ascending: false, nullsFirst: false })
    .range(from, from + pageSize - 1)
  if (error) throw new Error(`Unable to enumerate profiling attempts: ${error.message}`)
  allRuns.push(...(page ?? []))
  if (!page || page.length < pageSize) break
}
for (const run of allRuns) {
  if (!run.dataset_version_id || latestAttemptsByDatasetVersion.has(run.dataset_version_id)) continue
  latestAttemptsByDatasetVersion.set(run.dataset_version_id, run)
}

const { data: activeSources, error: sourceError } = await supabase
  .schema('profiling')
  .from('dataset_execution_sources')
  .select('dataset_version_id,source_type,updated_at')
  .eq('active', true)
  .order('updated_at', { ascending: false })
if (sourceError) throw new Error(`Unable to enumerate active execution sources: ${sourceError.message}`)

const activeSourceTypes = {}
const activeSourceTypeByDatasetVersion = new Map()
const activeSourceCountByDatasetVersion = new Map()
for (const source of activeSources ?? []) {
  const key = String(source.source_type ?? '').toUpperCase()
  if (!key) continue
  activeSourceTypes[key] = Number(activeSourceTypes[key] ?? 0) + 1
  if (source.dataset_version_id) {
    activeSourceCountByDatasetVersion.set(
      source.dataset_version_id,
      Number(activeSourceCountByDatasetVersion.get(source.dataset_version_id) ?? 0) + 1,
    )
    if (!activeSourceTypeByDatasetVersion.has(source.dataset_version_id)) {
      activeSourceTypeByDatasetVersion.set(source.dataset_version_id, key)
    }
  }
}

function hasCanonicalInvestigation(summary) {
  if (!summary || typeof summary !== 'object' || Array.isArray(summary)) return false
  const investigation = summary.investigation
  return Boolean(
    investigation
      && typeof investigation === 'object'
      && !Array.isArray(investigation)
      && typeof investigation.status === 'string'
      && investigation.status.length > 0
      && typeof investigation.risk === 'string'
      && investigation.risk.length > 0
      && Array.isArray(investigation.recommendations)
      && Array.isArray(investigation.probable_root_causes)
      && !Object.prototype.hasOwnProperty.call(investigation, 'output'),
  )
}

const latestRuns = await Promise.all(Array.from(latestByDatasetVersion.values()).map(async (run) => {
  const [
    contractResult,
    profileColumnsResult,
    metricsResult,
    findingsResult,
    scoreResult,
    governanceResult,
  ] = await Promise.all([
    supabase.schema('profiling').rpc('validate_metric_execution_contract', { p_profile_run_id: run.id }),
    supabase.schema('profiling').from('profile_columns').select('id', { count: 'exact', head: true }).eq('profile_run_id', run.id),
    supabase.schema('profiling').from('profile_metrics').select('id', { count: 'exact', head: true }).eq('profile_run_id', run.id),
    supabase.schema('profiling').from('profile_findings').select('id', { count: 'exact', head: true }).eq('profile_run_id', run.id),
    supabase.schema('profiling').from('data_quality_scores').select('profile_run_id').eq('profile_run_id', run.id).maybeSingle(),
    supabase.schema('profiling').from('profile_run_governance_insights').select('profile_run_id').eq('profile_run_id', run.id).maybeSingle(),
  ])

  for (const [label, result] of [
    ['metric contract', contractResult],
    ['profile columns', profileColumnsResult],
    ['profile metrics', metricsResult],
    ['profile findings', findingsResult],
    ['quality score', scoreResult],
    ['governance insight', governanceResult],
  ]) {
    if (result.error) throw new Error(`Unable to validate ${label} for run ${run.id}: ${result.error.message}`)
  }

  return {
    id: run.id,
    datasetVersionId: run.dataset_version_id,
    sourceType: activeSourceTypeByDatasetVersion.get(run.dataset_version_id) ?? null,
    contract: contractResult.data,
    profileColumns: profileColumnsResult.count ?? 0,
    metrics: metricsResult.count ?? 0,
    findings: findingsResult.count ?? 0,
    scorePresent: Boolean(scoreResult.data),
    investigationPresent: hasCanonicalInvestigation(run.summary),
    governanceInsightPresent: Boolean(governanceResult.data),
  }
}))

const latestAttempts = Array.from(latestAttemptsByDatasetVersion.values()).map((run) => ({
  id: run.id,
  datasetVersionId: run.dataset_version_id,
  status: run.status,
  errorCode: run.error_code ?? null,
  activeSource: activeSourceTypeByDatasetVersion.has(run.dataset_version_id),
}))

const ambiguousActiveSourceDatasetVersions = Array.from(activeSourceCountByDatasetVersion.entries())
  .filter(([, count]) => count > 1)
  .map(([datasetVersionId]) => datasetVersionId)

const snapshot = {
  profileRuns,
  completedRuns,
  activeSourceTypes,
  ambiguousActiveSourceDatasetVersions,
  latestRuns,
  latestAttempts,
}
const result = evaluateProfilingProductionSnapshot(snapshot)
console.log(JSON.stringify({ snapshot, result }, null, 2))
if (!result.valid) {
  throw new Error(`Profiling production validation failed: ${result.failures.join(', ')}`)
}
