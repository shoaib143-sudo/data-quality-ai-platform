import type {
  AnalyticsQueryProvider,
  AnalyticsQueryRequest,
  AnalyticsQueryRow,
} from '@/lib/data-plane/contracts'
import { providerFetch } from '@/lib/data-plane/provider-runtime'

type MetricSpec = {
  table: string
  select: string
  filters: Record<string, string>
}

const metricSpecs: Record<string, MetricSpec> = {
  'profiling.run_history': {
    table: 'profiling_run_history',
    select: ['event_type AS eventType','toString(occurred_at) AS observedAt','profile_run_id AS profileRunId','dataset_id AS datasetId','dataset_version_id AS datasetVersionId','status','engine_name AS engineName','engine_version AS engineVersion','payload_json AS payloadJson'].join(', '),
    filters: { datasetId: 'dataset_id', datasetVersionId: 'dataset_version_id', profileRunId: 'profile_run_id', status: 'status' },
  },
  'profiling.metric_history': {
    table: 'profile_metric_history',
    select: ["'PROFILING.METRIC_BATCH_CAPTURED' AS eventType",'toString(occurred_at) AS observedAt','profile_run_id AS profileRunId','dataset_id AS datasetId','dataset_version_id AS datasetVersionId','profile_column_id AS profileColumnId','metric_key AS metricKey',"if(JSONHas(metric_json, 'numericValue'), toFloat64OrNull(JSONExtractRaw(metric_json, 'numericValue')), NULL) AS numericValue","nullIf(JSONExtractString(metric_json, 'textValue'), '') AS textValue","if(JSONHas(metric_json, 'booleanValue'), JSONExtractBool(metric_json, 'booleanValue'), NULL) AS booleanValue",'metric_json AS metricJson'].join(', '),
    filters: { datasetId: 'dataset_id', datasetVersionId: 'dataset_version_id', profileRunId: 'profile_run_id', metricKey: 'metric_key' },
  },
  'profiling.finding_history': {
    table: 'profile_finding_history',
    select: ['event_type AS eventType','toString(occurred_at) AS observedAt','finding_id AS findingId','profile_run_id AS profileRunId','dataset_id AS datasetId','dataset_version_id AS datasetVersionId','profile_column_id AS profileColumnId','finding_type AS findingType','severity','payload_json AS payloadJson'].join(', '),
    filters: { datasetId: 'dataset_id', datasetVersionId: 'dataset_version_id', profileRunId: 'profile_run_id', severity: 'severity', findingType: 'finding_type' },
  },
  'dq.score_history': {
    table: 'data_quality_score_history',
    select: ['event_type AS eventType','toString(occurred_at) AS observedAt','score_id AS scoreId','profile_run_id AS profileRunId','dataset_id AS datasetId','dataset_version_id AS datasetVersionId','completeness_score AS completenessScore','uniqueness_score AS uniquenessScore','validity_score AS validityScore','accuracy_score AS accuracyScore','overall_score AS overallScore'].join(', '),
    filters: { datasetId: 'dataset_id', datasetVersionId: 'dataset_version_id', profileRunId: 'profile_run_id' },
  },
  'observability.alert_history': {
    table: 'observability_alert_history',
    select: ['event_type AS eventType','toString(occurred_at) AS observedAt','alert_id AS alertId','dataset_id AS datasetId','dataset_version_id AS datasetVersionId','profile_run_id AS profileRunId','category','severity','status','fingerprint','payload_json AS payloadJson'].join(', '),
    filters: { datasetId: 'dataset_id', datasetVersionId: 'dataset_version_id', profileRunId: 'profile_run_id', category: 'category', severity: 'severity', status: 'status' },
  },
  'observability.incident_history': {
    table: 'observability_incident_history',
    select: ['event_type AS eventType','toString(occurred_at) AS observedAt','incident_id AS incidentId','dataset_id AS datasetId','severity','status','confidence','approval_required AS approvalRequired','escalation_level AS escalationLevel','payload_json AS payloadJson'].join(', '),
    filters: { datasetId: 'dataset_id', severity: 'severity', status: 'status' },
  },
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is not configured`)
  return value
}

function boundedLimit(value: number | undefined) {
  if (!Number.isFinite(value)) return 100
  return Math.max(1, Math.min(500, Math.trunc(value as number)))
}

function parseJsonEachRow(text: string): AnalyticsQueryRow[] {
  return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as AnalyticsQueryRow)
}

export class ClickHouseAnalyticsQueryProvider implements AnalyticsQueryProvider {
  readonly providerKey = 'clickhouse'

  async query(request: AnalyticsQueryRequest): Promise<AnalyticsQueryRow[]> {
    const spec = metricSpecs[request.metric]
    if (!spec) throw new Error(`Unsupported analytics metric: ${request.metric}`)
    if (request.dimensions?.length) throw new Error('Analytics dimensions are not enabled for this query contract yet')

    const endpoint = requireEnv('CLICKHOUSE_ENDPOINT').replace(/\/$/, '')
    const database = (process.env.CLICKHOUSE_DATABASE ?? 'datanexus').trim()
    const user = requireEnv('CLICKHOUSE_USER')
    const password = requireEnv('CLICKHOUSE_PASSWORD')
    const limit = boundedLimit(request.limit)
    const clauses = ['project_id = {projectId:UUID}']
    const parameters = new Map<string, string>([['projectId', request.projectId], ['limit', String(limit)]])

    if (request.from) { clauses.push("occurred_at >= parseDateTime64BestEffort({from:String}, 3, 'UTC')"); parameters.set('from', request.from) }
    if (request.to) { clauses.push("occurred_at <= parseDateTime64BestEffort({to:String}, 3, 'UTC')"); parameters.set('to', request.to) }

    let filterIndex = 0
    for (const [key, value] of Object.entries(request.filters ?? {})) {
      const column = spec.filters[key]
      if (!column) throw new Error(`Unsupported analytics filter for ${request.metric}: ${key}`)
      if (value == null) throw new Error(`Null analytics filter values are not supported: ${key}`)
      const parameter = `filter${filterIndex++}`
      clauses.push(`${column} = {${parameter}:String}`)
      parameters.set(parameter, String(value))
    }

    const sql = `SELECT ${spec.select} FROM ${spec.table} WHERE ${clauses.join(' AND ')} ORDER BY occurred_at DESC LIMIT {limit:UInt32} FORMAT JSONEachRow`
    const url = new URL(endpoint)
    url.searchParams.set('database', database)
    url.searchParams.set('query', sql)
    for (const [key, value] of parameters) url.searchParams.set(`param_${key}`, value)

    const response = await providerFetch(url, {
      method: 'POST',
      headers: { 'x-clickhouse-user': user, 'x-clickhouse-key': password },
      cache: 'no-store',
    }, { providerKey: 'clickhouse' })
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 2000)
      throw new Error(`ClickHouse analytics query failed (${response.status}): ${detail || response.statusText}`)
    }
    return parseJsonEachRow(await response.text())
  }
}
