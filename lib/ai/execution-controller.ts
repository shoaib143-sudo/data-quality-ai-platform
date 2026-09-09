export type ExecutionControlScopeType = 'PROJECT' | 'AI_SYSTEM' | 'AGENT'
export type ExecutionControlState = 'PAUSE' | 'KILL' | 'RUNNING'

export type ExecutionControlRow = {
  id: string
  project_id: string
  scope_type: ExecutionControlScopeType
  scope_key: string
  effective_state: ExecutionControlState
  control_action: 'PAUSE' | 'KILL' | 'RESUME'
  reason: string
  actor_user_id: string
  actor_capability: string
  correlation_id: string | null
  created_at: string
}

export type ExecutionControlPersistence = {
  listEffectiveControls(projectId: string): Promise<ExecutionControlRow[]>
}

export type ExecutionControlRequest = {
  projectId: string
  agentDefinitionId?: string | null
}

export type ExecutionControlDecision =
  | {
      allowed: true
      decision: 'ALLOW_NO_CONTROL' | 'ALLOW_RESUMED'
      blockingControls: []
      applicableControls: ExecutionControlRow[]
    }
  | {
      allowed: false
      decision: 'DENY_PAUSED' | 'DENY_KILLED'
      blockingControls: ExecutionControlRow[]
      applicableControls: ExecutionControlRow[]
    }

export class ExecutionControlDeniedError extends Error {
  readonly code = 'AI_EXECUTION_CONTROL_BLOCKED'
  readonly decision: Extract<ExecutionControlDecision['decision'], 'DENY_PAUSED' | 'DENY_KILLED'>
  readonly scopes: Array<{ scopeType: ExecutionControlScopeType; scopeKey: string; state: 'PAUSE' | 'KILL' }>

  constructor(decision: Extract<ExecutionControlDecision['decision'], 'DENY_PAUSED' | 'DENY_KILLED'>, controls: ExecutionControlRow[]) {
    super(decision === 'DENY_KILLED' ? 'AI execution is killed by a governed execution control.' : 'AI execution is paused by a governed execution control.')
    this.name = 'ExecutionControlDeniedError'
    this.decision = decision
    this.scopes = controls.map((row) => ({ scopeType: row.scope_type, scopeKey: row.scope_key, state: row.effective_state as 'PAUSE' | 'KILL' }))
  }
}

export function isExecutionControlDeniedError(error: unknown): error is ExecutionControlDeniedError {
  return error instanceof ExecutionControlDeniedError
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function applies(row: ExecutionControlRow, projectId: string, agentDefinitionId: string | null) {
  if (row.project_id !== projectId) return false
  if (row.scope_type === 'PROJECT') return row.scope_key.trim().toUpperCase() === 'PROJECT' || row.scope_key === projectId
  if (row.scope_type === 'AGENT') return Boolean(agentDefinitionId) && row.scope_key === agentDefinitionId
  return false
}

export class GovernedExecutionController {
  private readonly persistence: ExecutionControlPersistence

  constructor(persistence: ExecutionControlPersistence) {
    this.persistence = persistence
  }

  async evaluate(request: ExecutionControlRequest): Promise<ExecutionControlDecision> {
    const projectId = requiredText(request.projectId, 'projectId')
    const agentDefinitionId = request.agentDefinitionId?.trim() || null
    const rows = await this.persistence.listEffectiveControls(projectId)
    const applicableControls = rows.filter((row) => applies(row, projectId, agentDefinitionId))

    const killed = applicableControls.filter((row) => row.effective_state === 'KILL')
    if (killed.length) return { allowed: false, decision: 'DENY_KILLED', blockingControls: killed, applicableControls }

    const paused = applicableControls.filter((row) => row.effective_state === 'PAUSE')
    if (paused.length) return { allowed: false, decision: 'DENY_PAUSED', blockingControls: paused, applicableControls }

    if (applicableControls.some((row) => row.effective_state === 'RUNNING')) {
      return { allowed: true, decision: 'ALLOW_RESUMED', blockingControls: [], applicableControls }
    }

    return { allowed: true, decision: 'ALLOW_NO_CONTROL', blockingControls: [], applicableControls }
  }

  async assertAllowed(request: ExecutionControlRequest): Promise<ExecutionControlDecision> {
    const result = await this.evaluate(request)
    if (!result.allowed) throw new ExecutionControlDeniedError(result.decision, result.blockingControls)
    return result
  }
}
