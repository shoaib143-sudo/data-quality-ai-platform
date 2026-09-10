import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ProjectReasoningBudget,
  ReasoningAdmissionPolicy,
  ReasoningBudgetContext,
  ReasoningBudgetPolicyProvider,
  ReasoningBudgetScopeType,
} from './reasoning-budget-policy'

function optionalPositiveInteger(value: unknown, label: string) {
  if (value == null) return null
  const normalized = Number(value)
  if (!Number.isSafeInteger(normalized) || normalized <= 0) throw new Error(`${label} is invalid`)
  return normalized
}

function minimum(values: Array<number | null>) {
  const concrete = values.filter((value): value is number => value !== null)
  return concrete.length ? Math.min(...concrete) : null
}

type BudgetRow = {
  id: string
  scope_type: ReasoningBudgetScopeType
  scope_key: string
  enabled: boolean
  max_output_tokens_per_request: unknown
  max_requests_per_minute: unknown
  max_concurrent_executions: unknown
}

function matchesContext(row: BudgetRow, context: ReasoningBudgetContext) {
  if (!row.enabled) return false
  if (row.scope_type === 'PROJECT') return row.scope_key === 'PROJECT'
  if (row.scope_type === 'AI_SYSTEM') return Boolean(context.aiSystemId && row.scope_key === context.aiSystemId)
  if (row.scope_type === 'AGENT') return Boolean(context.agentDefinitionId && row.scope_key === context.agentDefinitionId)
  return false
}

function composeBudget(rows: BudgetRow[]): ProjectReasoningBudget | null {
  if (!rows.length) return null
  const limits = rows.map((row) => ({
    row,
    maxOutputTokens: optionalPositiveInteger(row.max_output_tokens_per_request, `${row.scope_type}/${row.scope_key} max_output_tokens_per_request`),
    maxRequestsPerMinute: optionalPositiveInteger(row.max_requests_per_minute, `${row.scope_type}/${row.scope_key} max_requests_per_minute`),
    maxConcurrentExecutions: optionalPositiveInteger(row.max_concurrent_executions, `${row.scope_type}/${row.scope_key} max_concurrent_executions`),
  }))
  const admissionPolicies: ReasoningAdmissionPolicy[] = limits
    .filter((entry) => entry.maxRequestsPerMinute !== null || entry.maxConcurrentExecutions !== null)
    .map((entry) => ({
      policyId: entry.row.id,
      scopeType: entry.row.scope_type,
      scopeKey: entry.row.scope_key,
      maxRequestsPerMinute: entry.maxRequestsPerMinute,
      maxConcurrentExecutions: entry.maxConcurrentExecutions,
    }))
  const project = limits.find((entry) => entry.row.scope_type === 'PROJECT')
  const primary = project ?? limits[0]
  return {
    policyId: primary.row.id,
    policyIds: limits.map((entry) => entry.row.id),
    admissionPolicies,
    maxOutputTokens: minimum(limits.map((entry) => entry.maxOutputTokens)),
    maxRequestsPerMinute: minimum(limits.map((entry) => entry.maxRequestsPerMinute)),
    maxConcurrentExecutions: minimum(limits.map((entry) => entry.maxConcurrentExecutions)),
  }
}

export function createGovernanceReasoningBudgetPolicyProvider(): ReasoningBudgetPolicyProvider {
  const admin = createAdminClient()

  async function resolve(context: ReasoningBudgetContext) {
    const normalizedProjectId = context.projectId.trim()
    if (!normalizedProjectId) throw new Error('projectId is required')
    const normalizedContext: ReasoningBudgetContext = {
      projectId: normalizedProjectId,
      aiSystemId: context.aiSystemId?.trim() || null,
      agentDefinitionId: context.agentDefinitionId?.trim() || null,
    }

    const { data, error } = await admin.schema('governance').from('ai_resource_budget_policy_effective')
      .select('id,scope_type,scope_key,enabled,max_output_tokens_per_request,max_requests_per_minute,max_concurrent_executions')
      .eq('project_id', normalizedProjectId)
    if (error) throw new Error(`Unable to resolve AI reasoning budgets: ${error.message}`)

    const applicable = ((data ?? []) as BudgetRow[]).filter((row) => matchesContext(row, normalizedContext))
    return composeBudget(applicable)
  }

  return {
    resolveProjectBudget(projectId) {
      return resolve({ projectId })
    },
    resolveBudget(context) {
      return resolve(context)
    },
  }
}
