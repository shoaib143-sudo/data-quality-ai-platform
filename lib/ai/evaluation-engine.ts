export type EvaluationJson = Record<string, unknown>

export type EvaluationResultInput = {
  projectId: string
  evaluationType: string
  capability?: string | null
  metricName: string
  score?: number | null
  pass?: boolean | null
  evaluatorType: string
  evaluatorVersion?: string | null
  aiSystemId?: string | null
  aiSystemVersionId?: string | null
  agentRunId?: string | null
  sourceAgentEvaluationId?: string | null
  telemetryEventId?: string | null
  correlationId?: string | null
  evidenceRefs?: string[]
  dimensions?: EvaluationJson
  metadata?: EvaluationJson
  observedAt?: string
}

export type EvaluationReceipt = {
  resultId: string
  persisted: true
}

export type EvaluationScorecardRequest = {
  projectId: string
  aiSystemVersionId?: string | null
  evaluationType?: string | null
  capability?: string | null
}

export type EvaluationScorecardMetric = {
  evaluationType: string
  capability: string | null
  metricName: string
  sampleCount: number
  scoredCount: number
  passCount: number
  failCount: number
  averageScore: number | null
  evidenceResultIds: string[]
  lastObservedAt: string | null
}

export interface EvaluationEngine {
  readonly id: string
  record(result: EvaluationResultInput): Promise<EvaluationReceipt>
  scorecard(request: EvaluationScorecardRequest): Promise<EvaluationScorecardMetric[]>
}

export type EvaluationPersistenceRecord = {
  project_id: string
  evaluation_type: string
  capability: string | null
  metric_name: string
  score: number | null
  pass: boolean | null
  evaluator_type: string
  evaluator_version: string | null
  ai_system_id: string | null
  ai_system_version_id: string | null
  agent_run_id: string | null
  source_agent_evaluation_id: string | null
  telemetry_event_id: string | null
  correlation_id: string | null
  evidence_refs: string[]
  dimensions: EvaluationJson
  metadata: EvaluationJson
  observed_at?: string
}

export type EvaluationScorecardRow = {
  evaluation_type: string
  capability: string | null
  metric_name: string
  sample_count: number | string
  scored_count: number | string
  pass_count: number | string
  fail_count: number | string
  average_score: number | string | null
  evidence_result_ids: string[] | null
  last_observed_at: string | null
}

export type EvaluationPersistence = {
  insert(record: EvaluationPersistenceRecord): Promise<{ id: string }>
  scorecard(request: EvaluationScorecardRequest): Promise<EvaluationScorecardRow[]>
}

const FORBIDDEN_PAYLOAD_KEYS = new Set([
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

function assertSafeJson(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeJson(entry, `${path}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return

  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PAYLOAD_KEYS.has(normalizeKey(key))) {
      throw new Error(`Evaluation evidence must not contain prompt, completion, or hidden reasoning payloads: ${path}.${key}`)
    }
    assertSafeJson(nested, `${path}.${key}`)
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

function boundedScore(value: number | null | undefined) {
  if (value == null) return null
  if (!Number.isFinite(value) || value < 0 || value > 1) throw new Error('score must be between 0 and 1')
  return value
}

function evidenceRefs(values: string[] | undefined) {
  const refs = [...new Set((values ?? []).map((value) => value.trim()).filter(Boolean))]
  if (refs.length > 200) throw new Error('evidenceRefs must contain at most 200 references')
  return refs
}

function numeric(value: number | string, label: string) {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`Invalid ${label} in evaluation scorecard`)
  return parsed
}

export class DurableEvaluationEngine implements EvaluationEngine {
  readonly id = 'postgres_evaluation_engine'
  private readonly persistence: EvaluationPersistence

  constructor(persistence: EvaluationPersistence) {
    this.persistence = persistence
  }

  async record(result: EvaluationResultInput): Promise<EvaluationReceipt> {
    const dimensions = result.dimensions ?? {}
    const metadata = result.metadata ?? {}
    assertSafeJson(dimensions, 'dimensions')
    assertSafeJson(metadata, 'metadata')

    const score = boundedScore(result.score)
    const pass = result.pass ?? null
    if (score == null && pass == null) throw new Error('Evaluation result requires score or pass evidence')

    let observedAt: string | undefined
    if (result.observedAt) {
      const parsed = new Date(result.observedAt)
      if (Number.isNaN(parsed.getTime())) throw new Error('observedAt must be a valid timestamp')
      observedAt = parsed.toISOString()
    }

    const persisted = await this.persistence.insert({
      project_id: requiredText(result.projectId, 'projectId'),
      evaluation_type: requiredText(result.evaluationType, 'evaluationType'),
      capability: optionalText(result.capability),
      metric_name: requiredText(result.metricName, 'metricName'),
      score,
      pass,
      evaluator_type: requiredText(result.evaluatorType, 'evaluatorType'),
      evaluator_version: optionalText(result.evaluatorVersion),
      ai_system_id: optionalText(result.aiSystemId),
      ai_system_version_id: optionalText(result.aiSystemVersionId),
      agent_run_id: optionalText(result.agentRunId),
      source_agent_evaluation_id: optionalText(result.sourceAgentEvaluationId),
      telemetry_event_id: optionalText(result.telemetryEventId),
      correlation_id: optionalText(result.correlationId),
      evidence_refs: evidenceRefs(result.evidenceRefs),
      dimensions,
      metadata,
      ...(observedAt ? { observed_at: observedAt } : {}),
    })

    return { resultId: persisted.id, persisted: true }
  }

  async scorecard(request: EvaluationScorecardRequest): Promise<EvaluationScorecardMetric[]> {
    const normalized: EvaluationScorecardRequest = {
      projectId: requiredText(request.projectId, 'projectId'),
      aiSystemVersionId: optionalText(request.aiSystemVersionId),
      evaluationType: optionalText(request.evaluationType),
      capability: optionalText(request.capability),
    }
    const rows = await this.persistence.scorecard(normalized)
    return rows.map((row) => ({
      evaluationType: row.evaluation_type,
      capability: row.capability,
      metricName: row.metric_name,
      sampleCount: numeric(row.sample_count, 'sample_count'),
      scoredCount: numeric(row.scored_count, 'scored_count'),
      passCount: numeric(row.pass_count, 'pass_count'),
      failCount: numeric(row.fail_count, 'fail_count'),
      averageScore: row.average_score == null ? null : numeric(row.average_score, 'average_score'),
      evidenceResultIds: [...new Set(row.evidence_result_ids ?? [])],
      lastObservedAt: row.last_observed_at,
    }))
  }
}