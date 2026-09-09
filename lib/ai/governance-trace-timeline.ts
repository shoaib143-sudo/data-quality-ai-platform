import { createAdminClient } from '@/lib/supabase/admin'
import { projectTraceInvocationEvidence, type TraceInvocationEvidence } from './trace-invocation-evidence'

export type GovernedTraceEvent = {
  id: string
  projectId: string
  traceId: string
  spanId: string | null
  parentSpanId: string | null
  eventType: string
  operation: string
  status: 'INFO' | 'SUCCESS' | 'ERROR'
  providerId: string | null
  modelName: string | null
  agentRunId: string | null
  correlationId: string | null
  latencyMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  costUsd: number | string | null
  invocationEvidence: TraceInvocationEvidence
  observedAt: string
}

export type GovernedTrace = {
  traceId: string
  firstObservedAt: string
  lastObservedAt: string
  eventCount: number
  errorCount: number
  events: GovernedTraceEvent[]
}

type TelemetryRow = {
  id: string
  project_id: string
  trace_id: string | null
  span_id: string | null
  parent_span_id: string | null
  event_type: string
  operation: string
  status: 'INFO' | 'SUCCESS' | 'ERROR'
  provider_id: string | null
  model_name: string | null
  agent_run_id: string | null
  correlation_id: string | null
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | string | null
  attributes: unknown
  observed_at: string
}

function projectTraceEvent(projectId: string, row: TelemetryRow): GovernedTraceEvent | null {
  if (row.project_id !== projectId || !row.trace_id) return null
  return {
    id: row.id,
    projectId: row.project_id,
    traceId: row.trace_id,
    spanId: row.span_id,
    parentSpanId: row.parent_span_id,
    eventType: row.event_type,
    operation: row.operation,
    status: row.status,
    providerId: row.provider_id,
    modelName: row.model_name,
    agentRunId: row.agent_run_id,
    correlationId: row.correlation_id,
    latencyMs: row.latency_ms,
    inputTokens: row.input_tokens,
    outputTokens: row.output_tokens,
    costUsd: row.cost_usd,
    invocationEvidence: projectTraceInvocationEvidence(row.attributes),
    observedAt: row.observed_at,
  }
}

export function groupGovernedTraceEvents(projectId: string, rows: TelemetryRow[]): GovernedTrace[] {
  const grouped = new Map<string, GovernedTraceEvent[]>()
  for (const row of rows) {
    const event = projectTraceEvent(projectId, row)
    if (!event) continue
    const events = grouped.get(event.traceId) ?? []
    events.push(event)
    grouped.set(event.traceId, events)
  }

  return [...grouped.entries()].map(([traceId, events]) => {
    const ordered = [...events].sort((a, b) => a.observedAt.localeCompare(b.observedAt))
    return {
      traceId,
      firstObservedAt: ordered[0].observedAt,
      lastObservedAt: ordered[ordered.length - 1].observedAt,
      eventCount: ordered.length,
      errorCount: ordered.filter((event) => event.status === 'ERROR').length,
      events: ordered,
    }
  }).sort((a, b) => b.lastObservedAt.localeCompare(a.lastObservedAt))
}

export async function readGovernedTraceTimeline(projectId: string, limit = 500): Promise<GovernedTrace[]> {
  const normalizedProjectId = projectId.trim()
  if (!normalizedProjectId) throw new Error('projectId is required')
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) throw new Error('limit must be an integer between 1 and 1000')

  const supabase = createAdminClient()
  const { data, error } = await supabase.schema('governance').from('ai_telemetry_events')
    .select('id,project_id,trace_id,span_id,parent_span_id,event_type,operation,status,provider_id,model_name,agent_run_id,correlation_id,latency_ms,input_tokens,output_tokens,cost_usd,attributes,observed_at')
    .eq('project_id', normalizedProjectId)
    .not('trace_id', 'is', null)
    .order('observed_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Unable to read trace-correlated AI telemetry: ${error.message}`)
  return groupGovernedTraceEvents(normalizedProjectId, (data ?? []) as TelemetryRow[])
}
