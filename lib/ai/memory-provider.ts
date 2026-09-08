export type MemoryClass =
  | 'working'
  | 'episodic'
  | 'semantic'
  | 'procedural'
  | 'performance'
  | 'forbidden'

export type MemoryCapabilities = Record<MemoryClass, boolean>

export type MemoryQuery = {
  projectId: string
  classes: MemoryClass[]
  agentRunId?: string | null
  limit?: number
}

export type MemoryEvidence = {
  source: string
  recordId: string
  verified: boolean
  syntheticBootstrap: boolean
}

export type MemoryRecord = {
  id: string
  projectId: string
  class: MemoryClass
  key: string
  content: Record<string, unknown>
  evidence: MemoryEvidence
  occurredAt: string | null
  expiresAt: string | null
}

export interface MemoryProvider {
  readonly id: string
  readonly capabilities: MemoryCapabilities
  retrieve(query: MemoryQuery): Promise<MemoryRecord[]>
}

export type WorkingMemoryRow = {
  id: string
  project_id: string
  agent_run_id: string
  memory_key: string
  content: Record<string, unknown>
  expires_at: string
  created_at: string
  updated_at: string
}

export type EpisodicMemoryRow = {
  id: string
  project_id: string
  source_agent_run_id: string | null
  case_key: string
  source_kind: string
  problem_type: string
  context: Record<string, unknown>
  decision_status: string | null
  outcome_status: string | null
  effectiveness: number | string | null
  confidence: number | string | null
  evidence: Record<string, unknown>
  status: string
  occurred_at: string | null
}

export type MemoryPersistence = {
  listWorking(input: { projectId: string; agentRunId: string; limit: number; now: string }): Promise<WorkingMemoryRow[]>
  listEpisodic(input: { projectId: string; limit: number }): Promise<EpisodicMemoryRow[]>
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function boundedLimit(value: number | undefined) {
  if (value == null) return 50
  if (!Number.isInteger(value) || value < 1) throw new Error('limit must be a positive integer')
  return Math.min(value, 200)
}

function hasSyntheticBootstrap(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasSyntheticBootstrap)
  if (!value || typeof value !== 'object') return false
  return Object.entries(value as Record<string, unknown>).some(([key, nested]) =>
    (key.toLowerCase() === 'synthetic_bootstrap' && nested === true) || hasSyntheticBootstrap(nested),
  )
}

function uniqueClasses(classes: MemoryClass[]) {
  return [...new Set(classes)]
}

export class CanonicalMemoryProvider implements MemoryProvider {
  readonly id = 'postgres_canonical_memory'
  readonly capabilities: MemoryCapabilities = {
    working: true,
    episodic: true,
    semantic: false,
    procedural: false,
    performance: false,
    forbidden: false,
  }

  private readonly persistence: MemoryPersistence

  constructor(persistence: MemoryPersistence) {
    this.persistence = persistence
  }

  async retrieve(query: MemoryQuery): Promise<MemoryRecord[]> {
    const projectId = requiredText(query.projectId, 'projectId')
    const classes = uniqueClasses(query.classes)
    if (classes.length === 0) throw new Error('At least one memory class is required')

    for (const memoryClass of classes) {
      if (!this.capabilities[memoryClass]) {
        throw new Error(`MemoryProvider does not support requested class: ${memoryClass}`)
      }
    }

    const limit = boundedLimit(query.limit)
    const records: MemoryRecord[] = []

    if (classes.includes('working')) {
      const agentRunId = requiredText(query.agentRunId ?? '', 'agentRunId for working memory')
      const now = new Date().toISOString()
      const rows = await this.persistence.listWorking({ projectId, agentRunId, limit, now })
      for (const row of rows) {
        if (row.project_id !== projectId || row.agent_run_id !== agentRunId) continue
        if (new Date(row.expires_at).getTime() <= new Date(now).getTime()) continue
        records.push({
          id: row.id,
          projectId,
          class: 'working',
          key: row.memory_key,
          content: row.content,
          evidence: {
            source: 'agent.agent_working_memory',
            recordId: row.id,
            verified: false,
            syntheticBootstrap: false,
          },
          occurredAt: row.updated_at || row.created_at,
          expiresAt: row.expires_at,
        })
      }
    }

    if (classes.includes('episodic')) {
      const rows = await this.persistence.listEpisodic({ projectId, limit })
      for (const row of rows) {
        if (row.project_id !== projectId) continue
        if (row.status !== 'ACTIVE') continue
        if (!row.source_agent_run_id) continue
        if (row.decision_status !== 'VERIFIED' || row.outcome_status !== 'VERIFIED') continue
        if (hasSyntheticBootstrap(row.evidence)) continue
        records.push({
          id: row.id,
          projectId,
          class: 'episodic',
          key: row.case_key,
          content: {
            sourceKind: row.source_kind,
            problemType: row.problem_type,
            context: row.context,
            effectiveness: row.effectiveness == null ? null : Number(row.effectiveness),
            confidence: row.confidence == null ? null : Number(row.confidence),
          },
          evidence: {
            source: 'agent.agent_learning_cases',
            recordId: row.id,
            verified: true,
            syntheticBootstrap: false,
          },
          occurredAt: row.occurred_at,
          expiresAt: null,
        })
      }
    }

    return records
      .sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''))
      .slice(0, limit)
  }
}
