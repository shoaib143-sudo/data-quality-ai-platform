export type TelemetryStatus = 'INFO' | 'SUCCESS' | 'ERROR'

export type TelemetryAttributes = Record<string, unknown>

export type TelemetryEvent = {
  projectId: string
  eventType: string
  operation: string
  status?: TelemetryStatus
  providerId?: string | null
  modelName?: string | null
  agentRunId?: string | null
  aiSystemId?: string | null
  aiSystemVersionId?: string | null
  correlationId?: string | null
  latencyMs?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  costUsd?: number | null
  attributes?: TelemetryAttributes
  observedAt?: string
}

export type TelemetryReceipt = {
  eventId: string
  persisted: true
}

export interface TelemetryProvider {
  readonly id: string
  record(event: TelemetryEvent): Promise<TelemetryReceipt>
}

export type TelemetryPersistenceRecord = {
  project_id: string
  event_type: string
  operation: string
  status: TelemetryStatus
  provider_id: string | null
  model_name: string | null
  agent_run_id: string | null
  ai_system_id: string | null
  ai_system_version_id: string | null
  correlation_id: string | null
  latency_ms: number | null
  input_tokens: number | null
  output_tokens: number | null
  cost_usd: number | null
  attributes: TelemetryAttributes
  observed_at?: string
}

export type TelemetryPersistence = {
  insert(record: TelemetryPersistenceRecord): Promise<{ id: string }>
}

const FORBIDDEN_ATTRIBUTE_KEYS = new Set([
  'prompt',
  'prompts',
  'completion',
  'completions',
  'reasoning',
  'chainofthought',
  'hiddenreasoning',
  'rawinput',
  'rawoutput',
])

function normalizeKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function assertSafeAttributes(value: unknown, path = 'attributes'): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeAttributes(entry, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_ATTRIBUTE_KEYS.has(normalizeKey(key))) {
      throw new Error(`Telemetry attributes must not contain prompt, completion, or hidden reasoning payloads: ${path}.${key}`)
    }
    assertSafeAttributes(nested, `${path}.${key}`)
  }
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function optionalText(value: string | null | undefined) {
  const normalized = value?.trim()
  return normalized ? normalized : null
}

function optionalNonNegativeNumber(value: number | null | undefined, label: string) {
  if (value == null) return null
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a finite non-negative number`)
  return value
}

function optionalNonNegativeInteger(value: number | null | undefined, label: string) {
  const normalized = optionalNonNegativeNumber(value, label)
  if (normalized != null && !Number.isInteger(normalized)) throw new Error(`${label} must be an integer`)
  return normalized
}

export class DurableTelemetryProvider implements TelemetryProvider {
  readonly id = 'postgres_ai_telemetry'
  private readonly persistence: TelemetryPersistence

  constructor(persistence: TelemetryPersistence) {
    this.persistence = persistence
  }

  async record(event: TelemetryEvent): Promise<TelemetryReceipt> {
    const attributes = event.attributes ?? {}
    assertSafeAttributes(attributes)

    let observedAt: string | undefined
    if (event.observedAt) {
      const parsed = new Date(event.observedAt)
      if (Number.isNaN(parsed.getTime())) throw new Error('observedAt must be a valid timestamp')
      observedAt = parsed.toISOString()
    }

    const record: TelemetryPersistenceRecord = {
      project_id: requiredText(event.projectId, 'projectId'),
      event_type: requiredText(event.eventType, 'eventType'),
      operation: requiredText(event.operation, 'operation'),
      status: event.status ?? 'INFO',
      provider_id: optionalText(event.providerId),
      model_name: optionalText(event.modelName),
      agent_run_id: optionalText(event.agentRunId),
      ai_system_id: optionalText(event.aiSystemId),
      ai_system_version_id: optionalText(event.aiSystemVersionId),
      correlation_id: optionalText(event.correlationId),
      latency_ms: optionalNonNegativeInteger(event.latencyMs, 'latencyMs'),
      input_tokens: optionalNonNegativeInteger(event.inputTokens, 'inputTokens'),
      output_tokens: optionalNonNegativeInteger(event.outputTokens, 'outputTokens'),
      cost_usd: optionalNonNegativeNumber(event.costUsd, 'costUsd'),
      attributes,
      ...(observedAt ? { observed_at: observedAt } : {}),
    }

    const persisted = await this.persistence.insert(record)
    return { eventId: persisted.id, persisted: true }
  }
}
