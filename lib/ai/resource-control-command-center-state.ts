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

export type ModelPricingAuthorityRow = {
  id: string
  project_id: string
  provider: string
  model_id: string
  pricing_version: string
  currency: string
  price_unit_tokens: number | string
  input_price_per_million_tokens: number | string
  output_price_per_million_tokens: number | string
  effective_from: string
  effective_to: string | null
  source_reference: string
  source_uri: string | null
  reviewed_at: string
  reviewer_capability: string
  review_note: string
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

export type ResourceBudgetAdmissionRow = {
  id: string
  project_id: string
  policy_version_id: string
  correlation_id: string
  admitted_at: string
}

export type ResourceBudgetConcurrencyLeaseRow = {
  id: string
  admission_id: string
  project_id: string
  policy_version_id: string
  correlation_id: string
  acquired_at: string
  expires_at: string
  released_at: string | null
}

export type ProjectOutputBudgetReadiness = {
  status: 'READY' | 'NOT_CONFIGURED' | 'DISABLED' | 'NO_OUTPUT_LIMIT'
  policyId: string | null
  maxOutputTokens: number | null
}

export type ResourceControlPersistence = {
  listEffectiveBudgets(projectId: string): Promise<ResourceBudgetControlRow[]>
  listEffectiveModelPricing(projectId: string): Promise<ModelPricingAuthorityRow[]>
  listEffectiveExecutionControls(projectId: string): Promise<ExecutionControlStateRow[]>
  listExecutionControlEvents(projectId: string): Promise<ExecutionControlEventRow[]>
  listRecentBudgetAdmissions(projectId: string): Promise<ResourceBudgetAdmissionRow[]>
  listRecentBudgetConcurrencyLeases(projectId: string): Promise<ResourceBudgetConcurrencyLeaseRow[]>
}

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

export function projectOutputBudgetReadiness(budgets: ResourceBudgetControlRow[]): ProjectOutputBudgetReadiness {
  const projectBudget = budgets.find((row) => row.scope_type === 'PROJECT' && row.scope_key === 'PROJECT')
  if (!projectBudget) return { status: 'NOT_CONFIGURED', policyId: null, maxOutputTokens: null }
  if (!projectBudget.enabled) return { status: 'DISABLED', policyId: projectBudget.id, maxOutputTokens: null }
  if (projectBudget.max_output_tokens_per_request == null) {
    return { status: 'NO_OUTPUT_LIMIT', policyId: projectBudget.id, maxOutputTokens: null }
  }
  return {
    status: 'READY',
    policyId: projectBudget.id,
    maxOutputTokens: projectBudget.max_output_tokens_per_request,
  }
}

export class GovernedResourceControlState {
  private readonly persistence: ResourceControlPersistence

  constructor(persistence: ResourceControlPersistence) {
    this.persistence = persistence
  }

  async read(projectIdInput: string) {
    const projectId = requiredText(projectIdInput, 'projectId')
    const [budgetsRaw, modelPricingRaw, controlsRaw, eventsRaw, admissionsRaw, leasesRaw] = await Promise.all([
      this.persistence.listEffectiveBudgets(projectId),
      this.persistence.listEffectiveModelPricing(projectId),
      this.persistence.listEffectiveExecutionControls(projectId),
      this.persistence.listExecutionControlEvents(projectId),
      this.persistence.listRecentBudgetAdmissions(projectId),
      this.persistence.listRecentBudgetConcurrencyLeases(projectId),
    ])

    const budgets = budgetsRaw.filter((row) => row.project_id === projectId)
    const modelPricing = modelPricingRaw.filter((row) => row.project_id === projectId)
    const executionControls = controlsRaw.filter((row) => row.project_id === projectId)
    const executionControlEvents = eventsRaw.filter((row) => row.project_id === projectId)
    const budgetAdmissions = admissionsRaw.filter((row) => row.project_id === projectId)
    const budgetConcurrencyLeases = leasesRaw.filter((row) => row.project_id === projectId)
    const now = Date.now()
    const activeBudgetConcurrencyLeases = budgetConcurrencyLeases.filter((row) => {
      const expiresAt = Date.parse(row.expires_at)
      return row.released_at == null && Number.isFinite(expiresAt) && expiresAt > now
    })

    return {
      projectId,
      budgets,
      modelPricing,
      executionControls,
      executionControlEvents,
      budgetAdmissions,
      budgetConcurrencyLeases,
      activeBudgetConcurrencyLeases,
      projectOutputBudget: projectOutputBudgetReadiness(budgets),
      counts: {
        effectiveBudgets: budgets.length,
        effectiveModelPricing: modelPricing.length,
        enabledBudgets: budgets.filter((row) => row.enabled).length,
        pausedScopes: executionControls.filter((row) => row.effective_state === 'PAUSE').length,
        killedScopes: executionControls.filter((row) => row.effective_state === 'KILL').length,
        runningScopes: executionControls.filter((row) => row.effective_state === 'RUNNING').length,
        recentControlEvents: executionControlEvents.length,
        recentBudgetAdmissions: budgetAdmissions.length,
        activeBudgetConcurrencyLeases: activeBudgetConcurrencyLeases.length,
      },
      controls: {
        budgetMutationEnabled: false as const,
        pricingMutationEnabled: false as const,
        emergencyMutationEnabled: false as const,
        admissionMutationEnabled: false as const,
        costEnforcementEnabled: false as const,
      },
    }
  }
}
