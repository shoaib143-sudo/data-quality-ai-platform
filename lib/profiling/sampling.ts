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
  capacityMaxRows: number
}

function finiteInt(value: unknown, fallback: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.floor(number)) : fallback
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

  const [{ data: policy, error: policyError }, { data: capacity, error: capacityError }] = await Promise.all([
    supabase.schema('profiling').from('sampling_policies').select('mode,max_rows,sample_percent,deterministic_seed').eq('dataset_id', dataset.id).maybeSingle(),
    supabase.schema('orchestration').from('capacity_policies').select('max_profile_rows').eq('project_id', dataset.project_id).maybeSingle(),
  ])
  if (policyError) throw new Error(`Unable to resolve sampling policy: ${policyError.message}`)
  if (capacityError) throw new Error(`Unable to resolve profiling capacity: ${capacityError.message}`)

  const capacityMaxRows = finiteInt(capacity?.max_profile_rows, 10_000)
  const configuredMaxRows = finiteInt(policy?.max_rows, 1000)
  const mode = ['FULL','FIXED','PERCENT'].includes(String(policy?.mode).toUpperCase())
    ? String(policy?.mode).toUpperCase() as SamplingMode
    : 'FIXED'
  const samplePercent = Math.min(100, Math.max(0.01, Number(policy?.sample_percent ?? 10)))
  const deterministicSeed = finiteInt(policy?.deterministic_seed, 17)
  const requested = finiteInt(requestedMaxRows, 1000)
  const loadLimit = Math.max(1, Math.min(
    capacityMaxRows,
    mode === 'FULL' ? Math.max(requested, configuredMaxRows) : configuredMaxRows,
  ))

  return {
    datasetId: dataset.id,
    projectId: dataset.project_id,
    mode,
    loadLimit,
    configuredMaxRows,
    samplePercent,
    deterministicSeed,
    capacityMaxRows,
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
    targetRows = Math.min(targetRows, policy.configuredMaxRows, policy.capacityMaxRows, rows.length)
  } else if (policy.mode === 'FIXED') {
    targetRows = Math.min(policy.configuredMaxRows, policy.capacityMaxRows, rows.length)
  } else {
    targetRows = Math.min(policy.capacityMaxRows, rows.length)
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
  if (policy.mode === 'FULL' && knownCount > policy.capacityMaxRows) {
    warnings.push(`FULL sampling was capped at the project capacity limit of ${policy.capacityMaxRows} rows.`)
  }
  if (policy.mode === 'PERCENT' && Math.ceil(knownCount * policy.samplePercent / 100) > policy.configuredMaxRows) {
    warnings.push(`Percentage sampling was capped at ${policy.configuredMaxRows} configured rows.`)
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
      capacity_max_rows: policy.capacityMaxRows,
    },
  }
}
