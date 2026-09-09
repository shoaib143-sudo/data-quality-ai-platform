import { createAdminClient } from '@/lib/supabase/admin'
import type {
  ProjectBudgetAdmission,
  ProjectBudgetAdmissionProvider,
  ProjectBudgetAdmissionReason,
} from './resource-budget-admission'

const ADMISSION_REASONS = new Set<ProjectBudgetAdmissionReason>([
  'ADMITTED',
  'ALREADY_ADMITTED',
  'POLICY_NOT_CURRENT',
  'POLICY_DISABLED',
  'RATE_LIMIT',
  'CONCURRENCY_LIMIT',
])

function requiredText(value: string, label: string) {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${label} is required`)
  return normalized
}

function nonNegativeInteger(value: unknown, label: string) {
  const normalized = Number(value)
  if (!Number.isSafeInteger(normalized) || normalized < 0) throw new Error(`${label} is invalid`)
  return normalized
}

function parseAdmissionRow(row: Record<string, unknown>): ProjectBudgetAdmission {
  const reason = typeof row.reason === 'string' && ADMISSION_REASONS.has(row.reason as ProjectBudgetAdmissionReason)
    ? row.reason as ProjectBudgetAdmissionReason
    : null
  if (!reason) throw new Error('Canonical project budget admission reason is invalid')
  if (typeof row.admitted !== 'boolean') throw new Error('Canonical project budget admission status is invalid')
  return {
    admitted: row.admitted,
    reason,
    admissionId: typeof row.admission_id === 'string' ? row.admission_id : null,
    leaseId: typeof row.lease_id === 'string' ? row.lease_id : null,
    requestCountLastMinute: nonNegativeInteger(row.request_count_last_minute, 'request_count_last_minute'),
    activeConcurrency: nonNegativeInteger(row.active_concurrency, 'active_concurrency'),
    leaseExpiresAt: typeof row.lease_expires_at === 'string' ? row.lease_expires_at : null,
  }
}

export function createGovernanceProjectBudgetAdmissionProvider(): ProjectBudgetAdmissionProvider {
  const admin = createAdminClient()
  return {
    async acquire(input) {
      const projectId = requiredText(input.projectId, 'projectId')
      const policyVersionId = requiredText(input.policyVersionId, 'policyVersionId')
      const correlationId = requiredText(input.correlationId, 'correlationId')
      const leaseTtlSeconds = input.leaseTtlSeconds ?? 300
      if (!Number.isSafeInteger(leaseTtlSeconds) || leaseTtlSeconds < 1 || leaseTtlSeconds > 3600) {
        throw new Error('leaseTtlSeconds must be between 1 and 3600')
      }

      const { data, error } = await admin.schema('governance').rpc('acquire_ai_project_resource_budget_admission', {
        p_project_id: projectId,
        p_policy_version_id: policyVersionId,
        p_correlation_id: correlationId,
        p_lease_ttl_seconds: leaseTtlSeconds,
      })
      if (error) throw new Error(`Unable to acquire project AI resource budget admission: ${error.message}`)
      const row = Array.isArray(data) ? data[0] : data
      if (!row || typeof row !== 'object') throw new Error('Project AI resource budget admission returned no decision')
      return parseAdmissionRow(row as Record<string, unknown>)
    },

    async release(input) {
      const projectId = requiredText(input.projectId, 'projectId')
      const leaseId = requiredText(input.leaseId, 'leaseId')
      const correlationId = requiredText(input.correlationId, 'correlationId')
      const { data, error } = await admin.schema('governance').rpc('release_ai_project_resource_budget_lease', {
        p_project_id: projectId,
        p_lease_id: leaseId,
        p_correlation_id: correlationId,
      })
      if (error) throw new Error(`Unable to release project AI resource budget lease: ${error.message}`)
      return data === true
    },
  }
}
