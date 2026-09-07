import { createAdminClient } from '@/lib/supabase/admin'
import type { DurableJob } from '@/lib/orchestration/queue'
import type { WorkloadCharacterization } from '@/lib/orchestration/workload'

export type CriticalPathProfile = {
  jobId: string
  ownEstimatedMs: number | null
  criticalPathMs: number
  descendantCount: number
  persistedEdgeCount: number
  graphTruncated: boolean
}

type DependencyRow = {
  project_id: string
  job_id: string
  depends_on_job_id: string
}

type QueueRow = {
  id: string
  project_id: string
  job_type: string
  entity_id: string | null
  status: string
}

type HistoryRow = {
  project_id: string
  job_type: string
  entity_id: string | null
  started_at: string | null
  completed_at: string | null
}

const TERMINAL_STATUSES = new Set(['SUCCEEDED', 'FAILED', 'DEAD', 'CANCELLED'])
const MAX_GRAPH_DEPTH = 8
const MAX_GRAPH_EDGES = 1000

function durationMs(row: HistoryRow) {
  if (!row.started_at || !row.completed_at) return null
  const started = new Date(row.started_at).getTime()
  const completed = new Date(row.completed_at).getTime()
  if (!Number.isFinite(started) || !Number.isFinite(completed) || completed < started) return null
  return completed - started
}

function median(values: number[]) {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle]
}

function historyEstimate(row: QueueRow, history: HistoryRow[]) {
  if (TERMINAL_STATUSES.has(row.status)) return 0
  const exact = history
    .filter((item) => item.project_id === row.project_id && item.job_type === row.job_type && item.entity_id === row.entity_id)
    .map(durationMs)
    .filter((value): value is number => value != null)
    .slice(0, 12)
  if (exact.length > 0) return median(exact)

  const fallback = history
    .filter((item) => item.project_id === row.project_id && item.job_type === row.job_type)
    .map(durationMs)
    .filter((value): value is number => value != null)
    .slice(0, 12)
  return median(fallback)
}

async function loadPersistedDescendants(jobs: DurableJob[]) {
  const admin = createAdminClient()
  const projectIds = [...new Set(jobs.map((job) => job.project_id))]
  const rootIds = jobs.map((job) => job.id)
  const edges: DependencyRow[] = []
  const knownIds = new Set(rootIds)
  let frontier = [...rootIds]
  let graphTruncated = false

  for (let depth = 0; depth < MAX_GRAPH_DEPTH && frontier.length > 0; depth += 1) {
    const { data, error } = await admin
      .schema('orchestration')
      .from('job_dependencies')
      .select('project_id,job_id,depends_on_job_id')
      .in('project_id', projectIds)
      .in('depends_on_job_id', frontier)
      .limit(MAX_GRAPH_EDGES)
    if (error) throw new Error(`Unable to resolve persisted scheduler dependencies: ${error.message}`)

    const next = new Set<string>()
    for (const item of data ?? []) {
      const edge = item as DependencyRow
      if (!edges.some((existing) => existing.job_id === edge.job_id && existing.depends_on_job_id === edge.depends_on_job_id)) {
        edges.push(edge)
      }
      if (!knownIds.has(edge.job_id)) {
        knownIds.add(edge.job_id)
        next.add(edge.job_id)
      }
      if (edges.length >= MAX_GRAPH_EDGES) {
        graphTruncated = true
        break
      }
    }
    if (graphTruncated) break
    frontier = [...next]
  }

  if (frontier.length > 0 && edges.length > 0) graphTruncated = graphTruncated || edges.length >= MAX_GRAPH_EDGES

  const ids = [...knownIds]
  const { data: queueData, error: queueError } = await admin
    .schema('orchestration')
    .from('job_queue')
    .select('id,project_id,job_type,entity_id,status')
    .in('id', ids)
  if (queueError) throw new Error(`Unable to resolve persisted scheduler graph jobs: ${queueError.message}`)
  const rows = (queueData ?? []) as QueueRow[]

  const jobTypes = [...new Set(rows.map((row) => row.job_type))]
  let history: HistoryRow[] = []
  if (jobTypes.length > 0) {
    const { data: historyData, error: historyError } = await admin
      .schema('orchestration')
      .from('job_queue')
      .select('project_id,job_type,entity_id,started_at,completed_at')
      .in('project_id', projectIds)
      .in('job_type', jobTypes)
      .eq('status', 'SUCCEEDED')
      .not('started_at', 'is', null)
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })
      .limit(500)
    if (historyError) throw new Error(`Unable to resolve critical-path runtime history: ${historyError.message}`)
    history = (historyData ?? []) as HistoryRow[]
  }

  return { edges, rows, history, graphTruncated }
}

export async function computeCriticalPathProfiles(
  jobs: DurableJob[],
  workload: Map<string, WorkloadCharacterization>,
) {
  const profiles = new Map<string, CriticalPathProfile>()
  if (jobs.length === 0) return profiles

  const { edges, rows, history, graphTruncated } = await loadPersistedDescendants(jobs)
  const rowById = new Map(rows.map((row) => [row.id, row]))
  const children = new Map<string, string[]>()
  for (const edge of edges) {
    const current = children.get(edge.depends_on_job_id) ?? []
    current.push(edge.job_id)
    children.set(edge.depends_on_job_id, current)
  }

  const rootIds = new Set(jobs.map((job) => job.id))
  const memo = new Map<string, number>()
  const visiting = new Set<string>()

  const estimateNode = (jobId: string): number => {
    const existing = memo.get(jobId)
    if (existing != null) return existing
    if (visiting.has(jobId)) return 0
    visiting.add(jobId)

    const row = rowById.get(jobId)
    const workloadEstimate = rootIds.has(jobId) ? workload.get(jobId)?.estimatedDurationMs ?? null : null
    const own = workloadEstimate ?? (row ? historyEstimate(row, history) : null) ?? 0
    const downstream = (children.get(jobId) ?? []).reduce(
      (maximum, childId) => Math.max(maximum, estimateNode(childId)),
      0,
    )
    const total = own + downstream
    visiting.delete(jobId)
    memo.set(jobId, total)
    return total
  }

  const descendantIds = (rootId: string) => {
    const seen = new Set<string>()
    const stack = [...(children.get(rootId) ?? [])]
    while (stack.length > 0) {
      const current = stack.pop()!
      if (seen.has(current)) continue
      seen.add(current)
      stack.push(...(children.get(current) ?? []))
    }
    return seen
  }

  for (const job of jobs) {
    const descendants = descendantIds(job.id)
    const ownEstimatedMs = workload.get(job.id)?.estimatedDurationMs ?? null
    const persistedEdgeCount = edges.filter((edge) => edge.depends_on_job_id === job.id || descendants.has(edge.depends_on_job_id)).length
    profiles.set(job.id, {
      jobId: job.id,
      ownEstimatedMs,
      criticalPathMs: estimateNode(job.id),
      descendantCount: descendants.size,
      persistedEdgeCount,
      graphTruncated,
    })
  }

  return profiles
}

export function orderJobsByCriticalPath(
  jobs: DurableJob[],
  profiles: Map<string, CriticalPathProfile>,
  workload: Map<string, WorkloadCharacterization>,
) {
  const ordered: DurableJob[] = []
  let index = 0
  while (index < jobs.length) {
    const priority = jobs[index].priority
    let end = index + 1
    while (end < jobs.length && jobs[end].priority === priority) end += 1
    const segment = jobs.slice(index, end)
    segment.sort((left, right) => {
      const leftCritical = profiles.get(left.id)?.criticalPathMs ?? 0
      const rightCritical = profiles.get(right.id)?.criticalPathMs ?? 0
      if (rightCritical !== leftCritical) return rightCritical - leftCritical
      const leftOwn = workload.get(left.id)?.estimatedDurationMs ?? -1
      const rightOwn = workload.get(right.id)?.estimatedDurationMs ?? -1
      return rightOwn - leftOwn
    })
    ordered.push(...segment)
    index = end
  }
  return ordered
}

export async function recordCriticalPathTelemetry(
  jobs: DurableJob[],
  profiles: Map<string, CriticalPathProfile>,
) {
  if (jobs.length === 0) return
  const admin = createAdminClient()
  const rows = jobs.map((job) => {
    const profile = profiles.get(job.id)
    return {
      project_id: job.project_id,
      metric_key: 'planner.critical_path_ms',
      numeric_value: profile?.criticalPathMs ?? 0,
      dimensions: {
        job_type: job.job_type,
        own_estimate_ms: profile?.ownEstimatedMs ?? null,
        descendant_count: profile?.descendantCount ?? 0,
        persisted_edge_count: profile?.persistedEdgeCount ?? 0,
        graph_truncated: profile?.graphTruncated ?? false,
        evidence_scope: 'PERSISTED_SCHEDULER_DAG_ONLY',
      },
    }
  })
  const { error } = await admin.schema('orchestration').from('platform_telemetry').insert(rows)
  if (error) console.error('[critical-path-telemetry]', error.message)
}
