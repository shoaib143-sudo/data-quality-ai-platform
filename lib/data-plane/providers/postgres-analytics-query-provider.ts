import type {
  AnalyticsQueryProvider,
  AnalyticsQueryRequest,
  AnalyticsQueryRow,
} from '@/lib/data-plane/contracts'
import { createAdminClient } from '@/lib/supabase/admin'

type AnalyticsEventRow = {
  event_type: string
  occurred_at: string
  aggregate_id: string
  payload: Record<string, unknown> | null
}

const metricEvents: Record<string, string[]> = {
  'profiling.run_history': ['PROFILING.RUN_CREATED', 'PROFILING.RUN_UPDATED'],
  'profiling.metric_history': ['PROFILING.METRIC_BATCH_CAPTURED'],
  'profiling.finding_history': ['PROFILING.FINDING_CREATED', 'PROFILING.FINDING_UPDATED', 'PROFILING.FINDING_DELETED'],
  'dq.score_history': ['DQ.SCORE_CREATED', 'DQ.SCORE_UPDATED'],
  'observability.alert_history': ['OBSERVABILITY.ALERT_CREATED', 'OBSERVABILITY.ALERT_UPDATED', 'OBSERVABILITY.ALERT_DELETED'],
  'observability.incident_history': ['OBSERVABILITY.INCIDENT_CREATED', 'OBSERVABILITY.INCIDENT_UPDATED', 'OBSERVABILITY.INCIDENT_DELETED'],
}

function boundedLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 100
  return Math.max(1, Math.min(500, Math.trunc(value as number)))
}

function text(value: unknown) {
  return typeof value === 'string' ? value : null
}

function number(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function boolean(value: unknown) {
  return typeof value === 'boolean' ? value : null
}

function matchesFilters(payload: Record<string, unknown>, filters: AnalyticsQueryRequest['filters']) {
  for (const [key, expected] of Object.entries(filters ?? {})) {
    if (!['datasetId', 'datasetVersionId', 'profileRunId', 'metricKey', 'severity', 'findingType', 'status', 'category'].includes(key)) {
      throw new Error(`Unsupported analytics filter: ${key}`)
    }
    if (payload[key] !== expected) return false
  }
  return true
}

function baseRow(row: AnalyticsEventRow): AnalyticsQueryRow {
  return {
    eventType: row.event_type,
    observedAt: row.occurred_at,
    aggregateId: row.aggregate_id,
  }
}

function toRunRow(row: AnalyticsEventRow): AnalyticsQueryRow {
  const payload = row.payload ?? {}
  return {
    ...baseRow(row),
    datasetId: text(payload.datasetId),
    datasetVersionId: text(payload.datasetVersionId),
    profileRunId: row.aggregate_id,
    status: text(payload.status),
    engineName: text(payload.engineName),
    engineVersion: text(payload.engineVersion),
    rowCount: number(payload.rowCount),
    columnCount: number(payload.columnCount),
    duplicateRowCount: number(payload.duplicateRowCount),
  }
}

function toFindingRow(row: AnalyticsEventRow): AnalyticsQueryRow {
  const payload = row.payload ?? {}
  return {
    ...baseRow(row),
    findingId: row.aggregate_id,
    datasetId: text(payload.datasetId),
    datasetVersionId: text(payload.datasetVersionId),
    profileRunId: text(payload.profileRunId),
    profileColumnId: text(payload.profileColumnId),
    findingType: text(payload.findingType),
    severity: text(payload.severity),
    confidence: number(payload.confidence),
  }
}

function toScoreRow(row: AnalyticsEventRow): AnalyticsQueryRow {
  const payload = row.payload ?? {}
  return {
    ...baseRow(row),
    scoreId: row.aggregate_id,
    datasetId: text(payload.datasetId),
    datasetVersionId: text(payload.datasetVersionId),
    profileRunId: text(payload.profileRunId),
    completenessScore: number(payload.completenessScore),
    uniquenessScore: number(payload.uniquenessScore),
    validityScore: number(payload.validityScore),
    accuracyScore: number(payload.accuracyScore),
    overallScore: number(payload.overallScore),
  }
}

function toAlertRow(row: AnalyticsEventRow): AnalyticsQueryRow {
  const payload = row.payload ?? {}
  return {
    ...baseRow(row),
    alertId: row.aggregate_id,
    datasetId: text(payload.datasetId),
    datasetVersionId: text(payload.datasetVersionId),
    profileRunId: text(payload.profileRunId),
    category: text(payload.category),
    severity: text(payload.severity),
    status: text(payload.status),
    fingerprint: text(payload.fingerprint),
    firstObservedAt: text(payload.firstObservedAt),
    lastObservedAt: text(payload.lastObservedAt),
    resolvedAt: text(payload.resolvedAt),
  }
}

function toIncidentRow(row: AnalyticsEventRow): AnalyticsQueryRow {
  const payload = row.payload ?? {}
  return {
    ...baseRow(row),
    incidentId: row.aggregate_id,
    datasetId: text(payload.datasetId),
    severity: text(payload.severity),
    status: text(payload.status),
    confidence: number(payload.confidence),
    approvalRequired: boolean(payload.approvalRequired),
    escalationLevel: number(payload.escalationLevel),
    firstObservedAt: text(payload.firstObservedAt),
    lastObservedAt: text(payload.lastObservedAt),
    acknowledgedAt: text(payload.acknowledgedAt),
    responseDueAt: text(payload.responseDueAt),
    resolvedAt: text(payload.resolvedAt),
    lastEscalatedAt: text(payload.lastEscalatedAt),
  }
}

function metricRows(row: AnalyticsEventRow, request: AnalyticsQueryRequest): AnalyticsQueryRow[] {
  const payload = row.payload ?? {}
  const metrics = Array.isArray(payload.metrics) ? payload.metrics : []
  const output: AnalyticsQueryRow[] = []
  for (const item of metrics) {
    if (!item || typeof item !== 'object') continue
    const metric = item as Record<string, unknown>
    const normalizedPayload = {
      datasetId: payload.datasetId,
      datasetVersionId: payload.datasetVersionId,
      profileRunId: payload.profileRunId,
      metricKey: metric.metricKey,
    }
    if (!matchesFilters(normalizedPayload, request.filters)) continue
    output.push({
      ...baseRow(row),
      datasetId: text(payload.datasetId),
      datasetVersionId: text(payload.datasetVersionId),
      profileRunId: text(payload.profileRunId) ?? row.aggregate_id,
      metricId: text(metric.metricId),
      profileColumnId: text(metric.profileColumnId),
      metricKey: text(metric.metricKey),
      numericValue: number(metric.numericValue),
      textValue: text(metric.textValue),
      booleanValue: boolean(metric.booleanValue),
    })
  }
  return output
}

export class PostgresAnalyticsQueryProvider implements AnalyticsQueryProvider {
  readonly providerKey = 'postgres'

  async query(request: AnalyticsQueryRequest): Promise<AnalyticsQueryRow[]> {
    const events = metricEvents[request.metric]
    if (!events) throw new Error(`Unsupported analytics metric: ${request.metric}`)

    const limit = boundedLimit(request.limit)
    const admin = createAdminClient()
    let query = admin
      .schema('orchestration')
      .from('analytics_events')
      .select('event_type,occurred_at,aggregate_id,payload')
      .eq('project_id', request.projectId)
      .in('event_type', events)
      .order('occurred_at', { ascending: false })
      .limit(request.metric === 'profiling.metric_history' ? Math.min(100, limit) : limit)

    if (request.from) query = query.gte('occurred_at', request.from)
    if (request.to) query = query.lte('occurred_at', request.to)

    const { data, error } = await query
    if (error) throw new Error(`Unable to query PostgreSQL analytics fallback: ${error.message}`)

    const rows = (data ?? []) as AnalyticsEventRow[]
    if (request.metric === 'profiling.metric_history') {
      return rows.flatMap((row) => metricRows(row, request)).slice(0, limit)
    }

    return rows
      .filter((row) => matchesFilters(row.payload ?? {}, request.filters))
      .map((row) => {
        if (request.metric === 'profiling.run_history') return toRunRow(row)
        if (request.metric === 'profiling.finding_history') return toFindingRow(row)
        if (request.metric === 'dq.score_history') return toScoreRow(row)
        if (request.metric === 'observability.alert_history') return toAlertRow(row)
        return toIncidentRow(row)
      })
      .slice(0, limit)
  }
}
