import type { SupabaseClient } from '@supabase/supabase-js'

export type SamplingMode = 'FULL' | 'FIXED' | 'PERCENT'

export type ResolvedSamplingPolicy = {
  datasetId: string
  projectId: string
  mode: SamplingMode
  loadLimit: number
  configuredMaxRows: number
  samplePercent: number
  deterministicSeed: number
  technicalMaxRows: number
  technicalMaxFileBytes: number
  advisoryMaxRows: number | null
  advisoryMaxFileBytes: number | null
}

function finiteInt(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.floor(number)) : fallback
}

function environmentInt(name: string, fallback: number, min: number, max: number) {
  const value = typeof process !== 'undefined' ? process.env[name] : undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

export async function resolveSamplingPolicy(
  supabase: SupabaseClient,
  datasetVersionId: string,
  requestedMaxRows = 1000,
): Promise<ResolvedSamplingPolicy> {
  const { data: version, error: versionError } = await supabase
    .schema('catalog')
    .from('dataset_versions')
    .select('id,dataset_id')
    .eq('id', datasetVersionId)
    .maybeSingle()
  if (versionError || !version) throw new Error(`Unable to resolve sampling dataset version: ${versionError?.message ?? 'not found'}`)

  const { data: dataset, error: datasetError } = await supabase
    .schema('catalog')
    .from('datasets')
    .select('id,project_id')
    .eq('id', version.dataset_id)
    .maybeSingle()
  if (datasetError || !dataset) throw new Error(`Unable to resolve sampling dataset: ${datasetError?.message ?? 'not found'}`)

  const [{ data: policy, error: policyError }, { data: advisory, error: advisoryError }] = await Promise.all([
    supabase.schema('profiling').from('sampling_policies').select('mode,max_rows,sample_percent,deterministic_seed').eq('dataset_id', dataset.id).maybeSingle(),
    supabase.schema('orchestration').from('capacity_policies').select('max_profile_rows,max_file_bytes').eq('project_id', dataset.project_id).maybeSingle(),
  ])
  if (policyError) throw new Error(`Unable to resolve sampling policy: ${policyError.message}`)
  if (advisoryError) throw new Error(`Unable to resolve advisory operating targets: ${advisoryError.message}`)

  const configuredMaxRows = finiteInt(policy?.max_rows, 1000)
  const mode = ['FULL','FIXED','PERCENT'].includes(String(policy?.mode).toUpperCase())
    ? String(policy?.mode).toUpperCase() as SamplingMode
    : 'FIXED'
  const samplePercent = Math.min(100, Math.max(0.01, Number(policy?.sample_percent ?? 10)))
  const deterministicSeed = finiteInt(policy?.deterministic_seed, 17)
  const requested = finiteInt(requestedMaxRows, 1000)

  // These are implementation safety ceilings for the current in-memory execution model,
  // not tenant quotas. Business operating targets are recorded only for telemetry.
  const technicalMaxRows = environmentInt('PROFILE_TECHNICAL_MAX_ROWS', 250_000, 1_000, 1_000_000)
  const technicalMaxFileBytes = environmentInt('FILE_TECHNICAL_MAX_BYTES', 250 * 1024 * 1024, 1 * 1024 * 1024, 1024 * 1024 * 1024)

  let desiredLoadRows: number
  if (mode === 'FULL') desiredLoadRows = technicalMaxRows
  else if (mode === 'PERCENT') desiredLoadRows = Math.max(requested, configuredMaxRows)
  else desiredLoadRows = configuredMaxRows
  const loadLimit = Math.min(technicalMaxRows, Math.max(1, desiredLoadRows))

  return {
    datasetId: dataset.id,
    projectId: dataset.project_id,
    mode,
    loadLimit,
    configuredMaxRows,
    samplePercent,
    deterministicSeed,
    technicalMaxRows,
    technicalMaxFileBytes,
    advisoryMaxRows: advisory?.max_profile_rows == null ? null : Number(advisory.max_profile_rows),
    advisoryMaxFileBytes: advisory?.max_file_bytes == null ? null : Number(advisory.max_file_bytes),
  }
}

function stableHash(value: string, seed: number) {
  let hash = 2166136261 ^ seed
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function canonicalRow(row: Record<string, unknown>) {
  const ordered = Object.fromEntries(Object.keys(row).sort().map((key) => [key, row[key]]))
  return JSON.stringify(ordered)
}

export function applySamplingPolicy<T extends Record<string, unknown>>(
  rows: T[],
  sourceRowCount: number | null,
  policy: ResolvedSamplingPolicy,
) {
  const knownCount = typeof sourceRowCount === 'number' && Number.isFinite(sourceRowCount) ? sourceRowCount : rows.length
  let targetRows = rows.length
  if (policy.mode === 'PERCENT') {
    targetRows = Math.max(1, Math.ceil(knownCount * policy.samplePercent / 100))
    targetRows = Math.min(targetRows, policy.configuredMaxRows, rows.length)
  } else if (policy.mode === 'FIXED') {
    targetRows = Math.min(policy.configuredMaxRows, rows.length)
  } else {
    targetRows = rows.length
  }

  let sampled = rows
  if (targetRows < rows.length) {
    sampled = [...rows]
      .map((row) => ({ row, hash: stableHash(canonicalRow(row), policy.deterministicSeed) }))
      .sort((a, b) => a.hash - b.hash)
      .slice(0, targetRows)
      .map((item) => item.row)
  }

  const warnings: string[] = []
  if (knownCount > sampled.length) {
    warnings.push(`Profiling used ${sampled.length} deterministic sample rows from ${knownCount} source rows under ${policy.mode} sampling.`)
  }
  if (policy.mode === 'FULL' && rows.length >= policy.technicalMaxRows && knownCount >= policy.technicalMaxRows) {
    warnings.push(`FULL profiling reached the current execution engine technical safety ceiling of ${policy.technicalMaxRows} in-memory rows. This is not a business quota; use a streaming/distributed executor for larger full scans.`)
  }
  if (policy.mode === 'PERCENT' && Math.ceil(knownCount * policy.samplePercent / 100) > policy.configuredMaxRows) {
    warnings.push(`Percentage sampling selected at most ${policy.configuredMaxRows} rows because that is the dataset sampling strategy, not a platform quota.`)
  }

  return {
    rows: sampled,
    sourceRowCount: knownCount,
    sampledRows: sampled.length,
    warnings,
    policy: {
      mode: policy.mode,
      configured_max_rows: policy.configuredMaxRows,
      sample_percent: policy.samplePercent,
      deterministic_seed: policy.deterministicSeed,
      technical_max_rows: policy.technicalMaxRows,
      technical_max_file_bytes: policy.technicalMaxFileBytes,
      advisory_max_rows: policy.advisoryMaxRows,
      advisory_max_file_bytes: policy.advisoryMaxFileBytes,
      quota_enforced: false,
    },
  }
}
