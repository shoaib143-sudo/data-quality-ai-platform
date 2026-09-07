import { createAdminClient } from '@/lib/supabase/admin'
import type { DurableJob } from '@/lib/orchestration/queue'

export type WorkloadClass = 'SMALL' | 'MEDIUM' | 'LARGE' | 'UNKNOWN'
export type WorkloadConfidence = 'HIGH' | 'MEDIUM' | 'LOW'
export type CardinalityAuthority = 'SOURCE_OBSERVED' | 'PROFILE_SAMPLE' | 'CATALOG_OBSERVED' | 'UNKNOWN'

export type WorkloadCharacterization = {
  jobId: string
  workloadClass: WorkloadClass
  confidence: WorkloadConfidence
  estimatedDurationMs: number | null
  historySamples: number
  columnCount: number | null
  observedRowCount: number | null
  rowCountAuthority: CardinalityAuthority
  sourceRowEstimate: number | null
  sizeBytes: number | null
  sizeAuthority: 'SOURCE_OBSERVED' | 'CATALOG_OBSERVED' | 'UNKNOWN'
  sourceKey: string | null
  sourceType: string | null
  reasons: string[]
}

type VersionRow = {
  id: string
  row_count: number | null
  column_count: number | null
  size_bytes: number | null
  metadata: Record<string, unknown> | null
}

type HistoryRow = {
  project_id: string
  job_type: string
  entity_id: string | null
  started_at: string | null
  completed_at: string | null
}

type ExecutionSourceRow = {
  dataset_version_id: string
  source_type: string | null
  execution_config: Record<string, unknown> | null
}

function finiteNumber(value: unknown) {
  if (value == null) return null
  if (typeof value === 'string' && value.trim() === '') return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle]
}

function durationMs(row: HistoryRow) {
  if (!row.started_at || !row.completed_at) return null
  const started = new Date(row.started_at).getTime()
  const completed = new Date(row.completed_at).getTime()
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) return null
  return completed - started
}

function profileSampleEvidence(metadata: Record<string, unknown> | null) {
  if (!metadata) return false
  return Boolean(text(metadata.latest_profile_run_id) || text(metadata.profile_facts_propagated_at))
}

function sourceObservedEstimate(metadata: Record<string, unknown> | null, valueKey: string, authorityKey: string) {
  if (!metadata || text(metadata[authorityKey]).toUpperCase() !== 'SOURCE_OBSERVED') return null
  return finiteNumber(metadata[valueKey])
}

function classify(input: {
  estimatedDurationMs: number | null
  historySamples: number
  columnCount: number | null
  sourceRowEstimate: number | null
  sourceSizeBytes: number | null
}) {
  const reasons: string[] = []
  const duration = input.estimatedDurationMs
  const columns = input.columnCount
  const rows = input.sourceRowEstimate
  const bytes = input.sourceSizeBytes

  if ((duration != null && duration >= 120_000) || (columns != null && columns > 250) || (rows != null && rows > 5_000_000) || (bytes != null && bytes > 5 * 1024 ** 3)) {
    if (duration != null && duration >= 120_000) reasons.push('historical_duration_large')
    if (columns != null && columns > 250) reasons.push('column_count_large')
    if (rows != null && rows > 5_000_000) reasons.push('source_row_estimate_large')
    if (bytes != null && bytes > 5 * 1024 ** 3) reasons.push('source_size_large')
    return { workloadClass: 'LARGE' as const, reasons }
  }

  if ((duration != null && duration >= 30_000) || (columns != null && columns > 80) || (rows != null && rows > 500_000) || (bytes != null && bytes > 512 * 1024 ** 2)) {
    if (duration != null && duration >= 30_000) reasons.push('historical_duration_medium')
    if (columns != null && columns > 80) reasons.push('column_count_medium')
    if (rows != null && rows > 500_000) reasons.push('source_row_estimate_medium')
    if (bytes != null && bytes > 512 * 1024 ** 2) reasons.push('source_size_medium')
    return { workloadClass: 'MEDIUM' as const, reasons }
  }

  if (duration != null || columns != null || rows != null || bytes != null) {
    if (duration != null) reasons.push('historical_duration_small')
    if (columns != null) reasons.push('column_count_small')
    if (rows != null) reasons.push('source_row_estimate_small')
    if (bytes != null) reasons.push('source_size_small')
    return { workloadClass: 'SMALL' as const, reasons }
  }

  return { workloadClass: 'UNKNOWN' as const, reasons: ['insufficient_workload_evidence'] }
}

function confidence(historySamples: number, hasSourceEstimate: boolean, columnCount: number | null): WorkloadConfidence {
  if (historySamples >= 3 && hasSourceEstimate) return 'HIGH'
  if (historySamples >= 2 || hasSourceEstimate) return 'MEDIUM'
  if (historySamples >= 1 || columnCount != null) return 'MEDIUM'
  return 'LOW'
}

export async function characterizeDurableJobs(jobs: DurableJob[]) {
  const result = new Map<string, WorkloadCharacterization>()
  if (jobs.length === 0) return result

  const admin = createAdminClient()
  const versionIds = [...new Set(jobs
    .filter((job) => job.entity_id && (job.job_type === 'PROFILING' || job.job_type === 'DATA_QUALITY'))
    .map((job) => job.entity_id)
    .filter((value): value is string => Boolean(value)))]
  const projectIds = [...new Set(jobs.map((job) => job.project_id))]
  const jobTypes = [...new Set(jobs.map((job) => job.job_type))]

  const [versionResult, sourceResult, historyResult] = await Promise.all([
    versionIds.length > 0
      ? admin.schema('catalog').from('dataset_versions').select('id,row_count,column_count,size_bytes,metadata').in('id', versionIds)
      : Promise.resolve({ data: [] as VersionRow[], error: null }),
    versionIds.length > 0
      ? admin.schema('profiling').from('dataset_execution_sources').select('dataset_version_id,source_type,execution_config').in('dataset_version_id', versionIds).eq('active', true)
      : Promise.resolve({ data: [] as ExecutionSourceRow[], error: null }),
    admin.schema('orchestration').from('job_queue')
      .select('project_id,job_type,entity_id,started_at,completed_at')
      .in('project_id', projectIds)
      .in('job_type', jobTypes)
      .eq('status', 'SUCCEEDED')
      .not('started_at', 'is', null)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(250),
  ])

  if (versionResult.error) throw new Error(`Unable to resolve workload dataset versions: ${versionResult.error.message}`)
  if (sourceResult.error) throw new Error(`Unable to resolve workload execution sources: ${sourceResult.error.message}`)
  if (historyResult.error) throw new Error(`Unable to resolve workload history: ${historyResult.error.message}`)

  const versions = new Map((versionResult.data ?? []).map((row) => [row.id, row as VersionRow]))
  const executionSources = new Map<string, ExecutionSourceRow>()
  for (const row of sourceResult.data ?? []) executionSources.set(row.dataset_version_id, row as ExecutionSourceRow)
  const history = (historyResult.data ?? []) as HistoryRow[]

  for (const job of jobs) {
    const version = job.entity_id ? versions.get(job.entity_id) ?? null : null
    const metadata = version?.metadata && typeof version.metadata === 'object' && !Array.isArray(version.metadata)
      ? version.metadata
      : null
    const executionSource = job.entity_id ? executionSources.get(job.entity_id) ?? null : null
    const executionConfig = executionSource?.execution_config && typeof executionSource.execution_config === 'object' && !Array.isArray(executionSource.execution_config)
      ? executionSource.execution_config
      : {}
    const sourceId = text(executionConfig.source_id) || text(job.payload?.sourceId) || text(job.payload?.source_id)
    const sourceKey = sourceId ? `source:${sourceId}` : null

    const exactHistory = history.filter((row) => row.project_id === job.project_id && row.job_type === job.job_type && row.entity_id === job.entity_id)
    const fallbackHistory = history.filter((row) => row.project_id === job.project_id && row.job_type === job.job_type)
    const selectedHistory = (exactHistory.length > 0 ? exactHistory : fallbackHistory).slice(0, 12)
    const durations = selectedHistory.map(durationMs).filter((value): value is number => value != null)
    const estimatedDurationMs = median(durations)

    const observedRowCount = finiteNumber(version?.row_count)
    const sampledEvidence = profileSampleEvidence(metadata)
    const explicitSourceRows = sourceObservedEstimate(metadata, 'source_row_count', 'source_row_count_authority')
    const explicitSourceSize = sourceObservedEstimate(metadata, 'source_size_bytes', 'source_size_bytes_authority')
    const rowCountAuthority: CardinalityAuthority = explicitSourceRows != null
      ? 'SOURCE_OBSERVED'
      : sampledEvidence && observedRowCount != null
        ? 'PROFILE_SAMPLE'
        : observedRowCount != null
          ? 'CATALOG_OBSERVED'
          : 'UNKNOWN'
    const sizeBytes = explicitSourceSize ?? finiteNumber(version?.size_bytes)
    const sizeAuthority = explicitSourceSize != null ? 'SOURCE_OBSERVED' : sizeBytes != null ? 'CATALOG_OBSERVED' : 'UNKNOWN'
    const columnCount = finiteNumber(version?.column_count)
    const sourceRowEstimate = explicitSourceRows
    const classified = classify({
      estimatedDurationMs,
      historySamples: durations.length,
      columnCount,
      sourceRowEstimate,
      sourceSizeBytes: explicitSourceSize,
    })

    result.set(job.id, {
      jobId: job.id,
      workloadClass: classified.workloadClass,
      confidence: confidence(durations.length, explicitSourceRows != null || explicitSourceSize != null, columnCount),
      estimatedDurationMs,
      historySamples: durations.length,
      columnCount,
      observedRowCount,
      rowCountAuthority,
      sourceRowEstimate,
      sizeBytes,
      sizeAuthority,
      sourceKey,
      sourceType: text(executionSource?.source_type) || text(job.payload?.sourceType) || text(job.payload?.source_type) || null,
      reasons: sampledEvidence && explicitSourceRows == null
        ? [...classified.reasons, 'PROFILE_SAMPLE_NOT_SOURCE_CARDINALITY']
        : classified.reasons,
    })
  }

  return result
}

export function orderJobsByEstimatedRuntime(jobs: DurableJob[], workload: Map<string, WorkloadCharacterization>) {
  const ordered: DurableJob[] = []
  let index = 0
  while (index < jobs.length) {
    const priority = jobs[index].priority
    let end = index + 1
    while (end < jobs.length && jobs[end].priority === priority) end += 1
    const segment = jobs.slice(index, end)
    segment.sort((left, right) => {
      const leftDuration = workload.get(left.id)?.estimatedDurationMs ?? -1
      const rightDuration = workload.get(right.id)?.estimatedDurationMs ?? -1
      return rightDuration - leftDuration
    })
    ordered.push(...segment)
    index = end
  }
  return ordered
}

export async function recordWorkloadTelemetry(jobs: DurableJob[], workload: Map<string, WorkloadCharacterization>) {
  if (jobs.length === 0) return
  const admin = createAdminClient()
  const rows = jobs.map((job) => {
    const profile = workload.get(job.id)
    return {
      project_id: job.project_id,
      metric_key: 'planner.workload_classified',
      numeric_value: profile?.estimatedDurationMs ?? 0,
      dimensions: {
        job_type: job.job_type,
        workload_class: profile?.workloadClass ?? 'UNKNOWN',
        confidence: profile?.confidence ?? 'LOW',
        history_samples: profile?.historySamples ?? 0,
        column_count: profile?.columnCount ?? null,
        observed_row_count: profile?.observedRowCount ?? null,
        row_count_authority: profile?.rowCountAuthority ?? 'UNKNOWN',
        source_row_estimate: profile?.sourceRowEstimate ?? null,
        size_bytes: profile?.sizeBytes ?? null,
        size_authority: profile?.sizeAuthority ?? 'UNKNOWN',
        source_key: profile?.sourceKey ?? null,
        source_type: profile?.sourceType ?? null,
        reasons: profile?.reasons ?? ['insufficient_workload_evidence'],
      },
    }
  })
  const { error } = await admin.schema('orchestration').from('platform_telemetry').insert(rows)
  if (error) console.error('[workload-telemetry]', error.message)
}
