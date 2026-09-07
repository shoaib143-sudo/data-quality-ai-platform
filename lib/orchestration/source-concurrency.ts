import { createAdminClient } from '@/lib/supabase/admin'
import type { DurableJob } from '@/lib/orchestration/queue'

export type JobSourceResource = {
  key: string | null
  sourceType: string | null
  projectId: string
}

type ControllerStateRow = {
  project_id: string
  source_key: string
  current_limit: number
  max_limit: number
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function boundedInteger(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.min(max, Math.max(min, Math.floor(numeric)))
}

export async function resolveJobSourceResources(jobs: DurableJob[]) {
  const resources = new Map<string, JobSourceResource>()
  if (jobs.length === 0) return resources

  const datasetVersionJobs = jobs.filter((job) =>
    job.entity_id && (job.job_type === 'PROFILING' || job.job_type === 'DATA_QUALITY' || job.job_type === 'OBSERVABILITY'))
  const datasetVersionIds = [...new Set(datasetVersionJobs
    .map((job) => job.entity_id)
    .filter((value): value is string => Boolean(value)))]

  if (datasetVersionIds.length > 0) {
    const admin = createAdminClient()
    const { data, error } = await admin
      .schema('profiling')
      .from('dataset_execution_sources')
      .select('dataset_version_id,source_type,execution_config')
      .in('dataset_version_id', datasetVersionIds)
      .eq('active', true)
    if (error) throw new Error(`Unable to resolve adaptive source resources: ${error.message}`)

    const byVersion = new Map<string, { key: string | null; sourceType: string | null }>()
    for (const row of data ?? []) {
      const executionConfig = row.execution_config && typeof row.execution_config === 'object' && !Array.isArray(row.execution_config)
        ? row.execution_config as Record<string, unknown>
        : {}
      const sourceId = text(executionConfig.source_id)
      byVersion.set(row.dataset_version_id, {
        key: sourceId ? `source:${sourceId}` : null,
        sourceType: text(row.source_type) || null,
      })
    }
    for (const job of datasetVersionJobs) {
      if (!job.entity_id) continue
      const resolved = byVersion.get(job.entity_id) ?? { key: null, sourceType: null }
      resources.set(job.id, { ...resolved, projectId: job.project_id })
    }
  }

  for (const job of jobs) {
    if (resources.has(job.id)) continue
    const payloadSourceId = text(job.payload?.sourceId) || text(job.payload?.source_id)
    const sourceBound = job.job_type === 'DISCOVERY' || job.job_type === 'LINEAGE_ENRICHMENT'
    const sourceId = payloadSourceId || (sourceBound ? text(job.entity_id) : '')
    resources.set(job.id, {
      key: sourceId ? `source:${sourceId}` : null,
      sourceType: text(job.payload?.sourceType) || text(job.payload?.source_type) || null,
      projectId: job.project_id,
    })
  }

  return resources
}

export async function resolveAdaptiveSourceLimits(
  resources: Map<string, JobSourceResource>,
  initialLimit: number,
  maxLimit: number,
) {
  const admin = createAdminClient()
  const hardMax = Math.max(1, maxLimit)
  const initial = Math.max(1, Math.min(initialLimit, hardMax))
  const unique = [...new Map([...resources.values()]
    .filter((resource) => resource.key)
    .map((resource) => [`${resource.projectId}:${resource.key}`, resource])).values()]
  const limits = new Map<string, number>()

  for (const resource of unique) limits.set(`${resource.projectId}:${resource.key}`, initial)
  if (unique.length === 0) return limits

  const projectIds = [...new Set(unique.map((resource) => resource.projectId))]
  const sourceKeys = [...new Set(unique.map((resource) => resource.key).filter((value): value is string => Boolean(value)))]
  const { data, error } = await admin
    .schema('orchestration')
    .from('source_concurrency_state')
    .select('project_id,source_key,current_limit,max_limit')
    .in('project_id', projectIds)
    .in('source_key', sourceKeys)
  if (error) throw new Error(`Unable to resolve adaptive source concurrency state: ${error.message}`)

  for (const row of data ?? []) {
    const state = row as ControllerStateRow
    limits.set(
      `${state.project_id}:${state.source_key}`,
      Math.max(1, Math.min(Number(state.current_limit), Number(state.max_limit), hardMax)),
    )
  }
  return limits
}

function pressureError(error: unknown) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  return /(\b429\b|\b503\b|too many requests|rate.?limit|throttl|resource exhausted|warehouse[^.]{0,40}busy|concurren|timed? out|timeout|connection reset|socket hang up|temporarily unavailable)/i.test(message)
}

export async function recordSourceConcurrencyOutcome(
  job: DurableJob,
  outcome: 'SUCCESS' | 'FAILURE',
  error?: unknown,
) {
  if (outcome === 'FAILURE' && !pressureError(error)) return null
  const resources = await resolveJobSourceResources([job])
  const resource = resources.get(job.id)
  if (!resource?.key) return null

  const configuredMax = boundedInteger(process.env.ORCHESTRATION_PER_SOURCE_MAX_CONCURRENCY, 4, 1, 16)
  const requestedInitial = boundedInteger(process.env.ORCHESTRATION_PER_SOURCE_CONCURRENCY, 2, 1, 16)
  const initialLimit = Math.min(requestedInitial, configuredMax)
  const signal = outcome === 'SUCCESS' ? 'CLEAN' : 'ADVERSE'

  const admin = createAdminClient()
  const { data, error: rpcError } = await admin.schema('orchestration').rpc('record_source_concurrency_signal', {
    p_project_id: job.project_id,
    p_source_key: resource.key,
    p_signal: signal,
    p_initial_limit: initialLimit,
    p_max_limit: configuredMax,
  })
  if (rpcError) throw new Error(`Unable to record source concurrency signal: ${rpcError.message}`)
  return data
}
