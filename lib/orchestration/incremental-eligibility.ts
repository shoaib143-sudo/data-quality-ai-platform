import { createAdminClient } from '@/lib/supabase/admin'
import type { DurableJob } from '@/lib/orchestration/queue'

type IncrementalBoundary = {
  authority?: unknown
  kind?: unknown
  ordering_proven?: unknown
  cursor_column?: unknown
  previous_value?: unknown
  current_value?: unknown
}

type ExecutionSourceRow = {
  dataset_version_id: string
  source_type: string | null
  execution_config: Record<string, unknown> | null
}

export type IncrementalEligibility = {
  jobId: string
  eligible: boolean
  executionMode: 'INCREMENTAL' | 'FULL_OR_SAMPLED_REQUIRED'
  reason: string
  boundaryKind: 'WATERMARK' | null
  authority: 'SOURCE_OBSERVED' | 'UNAVAILABLE'
  cursorColumn: string | null
  previousValue: string | number | null
  currentValue: string | number | null
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function text(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function scalar(value: unknown): string | number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) return value.trim()
  return null
}

function compareBoundary(previous: string | number, current: string | number) {
  if (typeof previous === 'number' && typeof current === 'number') return current > previous
  if (typeof previous === 'string' && typeof current === 'string') {
    const previousDate = Date.parse(previous)
    const currentDate = Date.parse(current)
    if (Number.isFinite(previousDate) && Number.isFinite(currentDate)) return currentDate > previousDate
    return false
  }
  return false
}

function evaluateBoundary(boundaryValue: unknown): Omit<IncrementalEligibility, 'jobId'> {
  const boundary = record(boundaryValue) as IncrementalBoundary
  const authority = text(boundary.authority).toUpperCase()
  const kind = text(boundary.kind).toUpperCase()
  const orderingProven = boundary.ordering_proven === true
  const cursorColumn = text(boundary.cursor_column) || null
  const previousValue = scalar(boundary.previous_value)
  const currentValue = scalar(boundary.current_value)

  if (authority !== 'SOURCE_OBSERVED') {
    return {
      eligible: false,
      executionMode: 'FULL_OR_SAMPLED_REQUIRED',
      reason: 'CHANGE_BOUNDARY_AUTHORITY_UNAVAILABLE',
      boundaryKind: null,
      authority: 'UNAVAILABLE',
      cursorColumn: null,
      previousValue: null,
      currentValue: null,
    }
  }

  if (kind !== 'WATERMARK') {
    return {
      eligible: false,
      executionMode: 'FULL_OR_SAMPLED_REQUIRED',
      reason: 'UNSUPPORTED_CHANGE_BOUNDARY_KIND',
      boundaryKind: null,
      authority: 'SOURCE_OBSERVED',
      cursorColumn,
      previousValue,
      currentValue,
    }
  }

  if (!orderingProven || !cursorColumn || previousValue == null || currentValue == null) {
    return {
      eligible: false,
      executionMode: 'FULL_OR_SAMPLED_REQUIRED',
      reason: 'CHANGE_BOUNDARY_INCOMPLETE',
      boundaryKind: 'WATERMARK',
      authority: 'SOURCE_OBSERVED',
      cursorColumn,
      previousValue,
      currentValue,
    }
  }

  if (!compareBoundary(previousValue, currentValue)) {
    return {
      eligible: false,
      executionMode: 'FULL_OR_SAMPLED_REQUIRED',
      reason: 'CHANGE_BOUNDARY_NOT_MONOTONIC',
      boundaryKind: 'WATERMARK',
      authority: 'SOURCE_OBSERVED',
      cursorColumn,
      previousValue,
      currentValue,
    }
  }

  return {
    eligible: true,
    executionMode: 'INCREMENTAL',
    reason: 'SOURCE_OBSERVED_MONOTONIC_WATERMARK',
    boundaryKind: 'WATERMARK',
    authority: 'SOURCE_OBSERVED',
    cursorColumn,
    previousValue,
    currentValue,
  }
}

export async function resolveIncrementalEligibility(jobs: DurableJob[]) {
  const result = new Map<string, IncrementalEligibility>()
  if (jobs.length === 0) return result

  const versionIds = [...new Set(jobs
    .filter((job) => job.entity_id && (job.job_type === 'PROFILING' || job.job_type === 'DATA_QUALITY'))
    .map((job) => job.entity_id)
    .filter((value): value is string => Boolean(value)))]

  const admin = createAdminClient()
  const sourceResult = versionIds.length > 0
    ? await admin.schema('profiling').from('dataset_execution_sources')
      .select('dataset_version_id,source_type,execution_config')
      .in('dataset_version_id', versionIds)
      .eq('active', true)
    : { data: [] as ExecutionSourceRow[], error: null }

  if (sourceResult.error) throw new Error(`Unable to resolve incremental execution sources: ${sourceResult.error.message}`)

  const sources = new Map<string, ExecutionSourceRow>()
  for (const row of sourceResult.data ?? []) sources.set(row.dataset_version_id, row as ExecutionSourceRow)

  for (const job of jobs) {
    const source = job.entity_id ? sources.get(job.entity_id) ?? null : null
    const config = record(source?.execution_config)
    const boundary = config.incremental_boundary ?? record(config.connection_metadata).incremental_boundary
    const evaluated = boundary == null
      ? {
          eligible: false,
          executionMode: 'FULL_OR_SAMPLED_REQUIRED' as const,
          reason: 'CHANGE_BOUNDARY_UNAVAILABLE',
          boundaryKind: null,
          authority: 'UNAVAILABLE' as const,
          cursorColumn: null,
          previousValue: null,
          currentValue: null,
        }
      : evaluateBoundary(boundary)

    result.set(job.id, { jobId: job.id, ...evaluated })
  }

  return result
}

export async function recordIncrementalEligibilityTelemetry(
  jobs: DurableJob[],
  eligibility: Map<string, IncrementalEligibility>,
) {
  if (jobs.length === 0) return
  const admin = createAdminClient()
  const rows = jobs.map((job) => {
    const decision = eligibility.get(job.id)
    return {
      project_id: job.project_id,
      metric_key: 'planner.incremental_eligibility',
      numeric_value: decision?.eligible ? 1 : 0,
      dimensions: {
        job_type: job.job_type,
        execution_mode: decision?.executionMode ?? 'FULL_OR_SAMPLED_REQUIRED',
        eligible: decision?.eligible ?? false,
        reason: decision?.reason ?? 'CHANGE_BOUNDARY_UNAVAILABLE',
        boundary_kind: decision?.boundaryKind ?? null,
        boundary_authority: decision?.authority ?? 'UNAVAILABLE',
        cursor_column: decision?.cursorColumn ?? null,
        previous_value: decision?.previousValue ?? null,
        current_value: decision?.currentValue ?? null,
      },
    }
  })
  const { error } = await admin.schema('orchestration').from('platform_telemetry').insert(rows)
  if (error) console.error('[incremental-eligibility-telemetry]', error.message)
}
