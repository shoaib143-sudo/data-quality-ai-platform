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

export type ExecutionControlDecision = {
  allowed: boolean
  decision: 'ALLOW_NO_CONTROL' | 'ALLOW_RESUMED' | 'DENY_PAUSED' | 'DENY_KILLED'
  blockingControls: ExecutionControlRow[]
  applicableControls: ExecutionControlRow[]
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
  constructor(private readonly persistence: ExecutionControlPersistence) {}

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
}
