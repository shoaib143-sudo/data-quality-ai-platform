import type { SupabaseClient } from '@supabase/supabase-js'

export type SamplingMode = 'FULL' | 'FIXED' | 'PERCENT'
export type SamplingPolicyOrigin = 'EXPLICIT_DATASET_POLICY' | 'AUTOMATIC_PLANNER'
export type SamplingEstimateAuthority = 'SOURCE_OBSERVED' | 'UNKNOWN'
export type SamplingCoverageScope = 'FULL_SOURCE_OBSERVED' | 'SAMPLED_OBSERVATION' | 'BOUNDED_OBSERVATION'

export type ResolvedSamplingPolicy = {
  datasetId: string
  projectId: string
  mode: SamplingMode
  policyOrigin: SamplingPolicyOrigin
  plannerReason: string
  loadLimit: number
  configuredMaxRows: number
  samplePercent: number
  deterministicSeed: number
  technicalMaxRows: number
  technicalMaxFileBytes: number
  advisoryMaxRows: number | null
  advisoryMaxFileBytes: number | null
  sourceRowEstimate: number | null
  sourceSizeEstimate: number | null
  sourceEstimateAuthority: SamplingEstimateAuthority
}

function finiteInt(value: unknown, fallback: number) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return fallback
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(1, Math.floor(number)) : fallback
}

function finiteNumber(value: unknown) {
  if (value == null || (typeof value === 'string' && value.trim() === '')) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

function environmentInt(name: string, fallback: number, min: number, max: number) {
  const value = typeof process !== 'undefined' ? process.env[name] : undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.floor(parsed)))
}

function metadataObject(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function sourceObservedEstimate(metadata: Record<string, unknown>, valueKey: string, authorityKey: string) {
  const authority = typeof metadata[authorityKey] === 'string' ? metadata[authorityKey].trim().toUpperCase() : ''
  if (authority !== 'SOURCE_OBSERVED') return null
  return finiteNumber(metadata[valueKey])
}

async function recordSamplingPlannerTelemetry(
  supabase: SupabaseClient,
  policy: ResolvedSamplingPolicy,
) {
  try {
    const { error } = await supabase.schema('orchestration').from('platform_telemetry').insert({
      project_id: policy.projectId,
      metric_key: 'planner.sampling_mode',
      numeric_value: policy.loadLimit,
      dimensions: {
        dataset_id: policy.datasetId,
        mode: policy.mode,
        policy_origin: policy.policyOrigin,
        planner_reason: policy.plannerReason,
        configured_max_rows: policy.configuredMaxRows,
        sample_percent: policy.samplePercent,
        source_row_estimate: policy.sourceRowEstimate,
        source_size_estimate: policy.sourceSizeEstimate,
        source_estimate_authority: policy.sourceEstimateAuthority,
        technical_max_rows: policy.technicalMaxRows,
        technical_max_file_bytes: policy.technicalMaxFileBytes,
      },
    })
    if (error) console.error('[sampling-planner-telemetry]', error.message)
  } catch (error) {
    console.error('[sampling-planner-telemetry]', error instanceof Error ? error.message : error)
  }
}

export async function resolveSamplingPolicy(
  supabase: SupabaseClient,
  datasetVersionId: string,
  requestedMaxRows = 1000,
): Promise<ResolvedSamplingPolicy> {
  const { data: version, error: versionError } = await supabase
    .schema('catalog')
    .from('dataset_versions')
    .select('id,dataset_id,row_count,column_count,size_bytes,metadata')
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

  const requested = finiteInt(requestedMaxRows, 1000)
  const technicalMaxRows = environmentInt('PROFILE_TECHNICAL_MAX_ROWS', 250_000, 1_000, 1_000_000)
  const technicalMaxFileBytes = environmentInt('FILE_TECHNICAL_MAX_BYTES', 250 * 1024 * 1024, 1 * 1024 * 1024, 1024 * 1024 * 1024)
  const autoFullScanMaxRows = Math.min(
    technicalMaxRows,
    environmentInt('PROFILE_AUTO_FULL_SCAN_MAX_ROWS', 50_000, 100, technicalMaxRows),
  )
  const autoSampleRows = Math.min(
    technicalMaxRows,
    environmentInt('PROFILE_AUTO_SAMPLE_ROWS', 10_000, 100, technicalMaxRows),
  )

  const metadata = metadataObject(version.metadata)
  const sourceRowEstimate = sourceObservedEstimate(metadata, 'source_row_count', 'source_row_count_authority')
  const sourceSizeEstimate = sourceObservedEstimate(metadata, 'source_size_bytes', 'source_size_bytes_authority')
  const sourceEstimateAuthority: SamplingEstimateAuthority = sourceRowEstimate != null || sourceSizeEstimate != null
    ? 'SOURCE_OBSERVED'
    : 'UNKNOWN'

  let mode: SamplingMode
  let configuredMaxRows: number
  let samplePercent: number
  let deterministicSeed: number
  let policyOrigin: SamplingPolicyOrigin
  let plannerReason: string

  if (policy) {
    mode = ['FULL', 'FIXED', 'PERCENT'].includes(String(policy.mode).toUpperCase())
      ? String(policy.mode).toUpperCase() as SamplingMode
      : 'FIXED'
    configuredMaxRows = finiteInt(policy.max_rows, 1000)
    samplePercent = Math.min(100, Math.max(0.01, Number(policy.sample_percent ?? 10)))
    deterministicSeed = finiteInt(policy.deterministic_seed, 17)
    policyOrigin = 'EXPLICIT_DATASET_POLICY'
    plannerReason = 'EXPLICIT_POLICY_PRESERVED'
  } else {
    policyOrigin = 'AUTOMATIC_PLANNER'
    deterministicSeed = 17
    samplePercent = 100

    const sourceRowsSafelyFull = sourceRowEstimate != null && sourceRowEstimate <= autoFullScanMaxRows
    const sourceBytesSafelyFull = sourceSizeEstimate != null && sourceSizeEstimate <= technicalMaxFileBytes
    const completeFullScanEvidence = sourceRowsSafelyFull && sourceBytesSafelyFull

    if (completeFullScanEvidence) {
      mode = 'FULL'
      configuredMaxRows = Math.max(1, Math.ceil(sourceRowEstimate))
      plannerReason = 'SOURCE_OBSERVED_SMALL_WORKLOAD_FULL_SCAN'
    } else if (
      (sourceRowEstimate != null && sourceRowEstimate > autoFullScanMaxRows)
      || (sourceSizeEstimate != null && sourceSizeEstimate > technicalMaxFileBytes)
    ) {
      mode = 'FIXED'
      configuredMaxRows = Math.max(100, Math.min(autoSampleRows, technicalMaxRows))
      plannerReason = 'SOURCE_OBSERVED_LARGE_WORKLOAD_SAFE_SAMPLE'
    } else {
      mode = 'FIXED'
      configuredMaxRows = Math.max(100, Math.min(requested, technicalMaxRows))
      plannerReason = sourceEstimateAuthority === 'SOURCE_OBSERVED'
        ? 'INCOMPLETE_SOURCE_SIZE_EVIDENCE_SAFE_SAMPLE'
        : 'UNKNOWN_SOURCE_CARDINALITY_SAFE_SAMPLE'
    }
  }

  let desiredLoadRows: number
  if (mode === 'FULL') desiredLoadRows = technicalMaxRows
  else if (mode === 'PERCENT') desiredLoadRows = Math.max(requested, configuredMaxRows)
  else desiredLoadRows = configuredMaxRows
  const loadLimit = Math.min(technicalMaxRows, Math.max(1, desiredLoadRows))

  const resolved: ResolvedSamplingPolicy = {
    datasetId: dataset.id,
    projectId: dataset.project_id,
    mode,
    policyOrigin,
    plannerReason,
    loadLimit,
    configuredMaxRows,
    samplePercent,
    deterministicSeed,
    technicalMaxRows,
    technicalMaxFileBytes,
    advisoryMaxRows: advisory?.max_profile_rows == null ? null : Number(advisory.max_profile_rows),
    advisoryMaxFileBytes: advisory?.max_file_bytes == null ? null : Number(advisory.max_file_bytes),
    sourceRowEstimate,
    sourceSizeEstimate,
    sourceEstimateAuthority,
  }

  await recordSamplingPlannerTelemetry(supabase, resolved)
  return resolved
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
  const connectorObservedCount = typeof sourceRowCount === 'number' && Number.isFinite(sourceRowCount) && sourceRowCount >= 0
    ? sourceRowCount
    : null
  const knownCount = policy.sourceRowEstimate ?? connectorObservedCount ?? rows.length
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

  const fullSourceCoverageClaimed = policy.mode === 'FULL'
    && policy.sourceEstimateAuthority === 'SOURCE_OBSERVED'
    && policy.sourceRowEstimate != null
    && policy.sourceSizeEstimate != null
    && sampled.length >= policy.sourceRowEstimate
    && rows.length >= policy.sourceRowEstimate
  const coverageScope: SamplingCoverageScope = fullSourceCoverageClaimed
    ? 'FULL_SOURCE_OBSERVED'
    : sampled.length < knownCount || policy.mode !== 'FULL'
      ? 'SAMPLED_OBSERVATION'
      : 'BOUNDED_OBSERVATION'

  const warnings: string[] = []
  if (!fullSourceCoverageClaimed) {
    warnings.push('Profiling evidence is bounded or sampled and must not be interpreted as proof of complete source coverage.')
  }
  if (knownCount > sampled.length) {
    warnings.push(`Profiling used ${sampled.length} deterministic sample rows from ${knownCount} observed/estimated rows under ${policy.mode} sampling.`)
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
      origin: policy.policyOrigin,
      planner_reason: policy.plannerReason,
      configured_max_rows: policy.configuredMaxRows,
      sample_percent: policy.samplePercent,
      deterministic_seed: policy.deterministicSeed,
      technical_max_rows: policy.technicalMaxRows,
      technical_max_file_bytes: policy.technicalMaxFileBytes,
      advisory_max_rows: policy.advisoryMaxRows,
      advisory_max_file_bytes: policy.advisoryMaxFileBytes,
      source_row_estimate: policy.sourceRowEstimate,
      source_size_estimate: policy.sourceSizeEstimate,
      source_estimate_authority: policy.sourceEstimateAuthority,
      coverage_scope: coverageScope,
      full_source_coverage_claimed: fullSourceCoverageClaimed,
      quota_enforced: false,
    },
  }
}
