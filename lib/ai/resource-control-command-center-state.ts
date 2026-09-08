export type ResourceBudgetControlRow = {
  id: string
  project_id: string
  scope_type: 'PROJECT' | 'AI_SYSTEM' | 'AGENT'
  scope_key: string
  enabled: boolean
  max_input_tokens_per_request: number | null
  max_output_tokens_per_request: number | null
  max_cost_usd_per_request: number | string | null
  max_cost_usd_per_day: number | string | null
  max_requests_per_minute: number | null
  max_concurrent_executions: number | null
  reviewer_user_id: string
  reviewer_capability: string
  review_note: string
  created_at: string
}

export type ExecutionControlStateRow = {
  id: string
  project_id: string
  scope_type: 'PROJECT' | 'AI_SYSTEM' | 'AGENT'
  scope_key: string
  control_action: 'PAUSE' | 'KILL' | 'RESUME'
  effective_state: 'PAUSE' | 'KILL' | 'RUNNING'
  reason: string
  actor_user_id: string
  actor_capability: string
  correlation_id: string | null
  created_at: string
}

export type ExecutionControlEventRow = Omit<ExecutionControlStateRow, 'effective_state'>

export type ResourceControlPersistence = {
  listEffectiveBudgets(projectId: string): Promise<ResourceBudgetControlRow[]>
  listEffectiveExecutionControls(projectId: string): Promise<ExecutionControlStateRow[]>
  listExecutionControlEvents(projectId: string): Promise<ExecutionControlEventRow[]>
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

export class GovernedResourceControlState {
  constructor(private readonly persistence: ResourceControlPersistence) {}

  async read(projectIdInput: string) {
    const projectId = requiredText(projectIdInput, 'projectId')
    const [budgetsRaw, controlsRaw, eventsRaw] = await Promise.all([
      this.persistence.listEffectiveBudgets(projectId),
      this.persistence.listEffectiveExecutionControls(projectId),
      this.persistence.listExecutionControlEvents(projectId),
    ])

    const budgets = budgetsRaw.filter((row) => row.project_id === projectId)
    const executionControls = controlsRaw.filter((row) => row.project_id === projectId)
    const executionControlEvents = eventsRaw.filter((row) => row.project_id === projectId)

    return {
      projectId,
      budgets,
      executionControls,
      executionControlEvents,
      counts: {
        effectiveBudgets: budgets.length,
        enabledBudgets: budgets.filter((row) => row.enabled).length,
        pausedScopes: executionControls.filter((row) => row.effective_state === 'PAUSE').length,
        killedScopes: executionControls.filter((row) => row.effective_state === 'KILL').length,
        runningScopes: executionControls.filter((row) => row.effective_state === 'RUNNING').length,
        recentControlEvents: executionControlEvents.length,
      },
      controls: {
        budgetMutationEnabled: false as const,
        emergencyMutationEnabled: false as const,
      },
    }
  }
}
