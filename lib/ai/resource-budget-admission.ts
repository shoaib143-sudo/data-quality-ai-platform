export type ProjectBudgetAdmissionReason =
  | 'ADMITTED'
  | 'ALREADY_ADMITTED'
  | 'POLICY_NOT_CURRENT'
  | 'POLICY_DISABLED'
  | 'RATE_LIMIT'
  | 'CONCURRENCY_LIMIT'
  | 'COST_EVIDENCE_INCOMPLETE'
  | 'COST_CURRENCY_UNSUPPORTED'
  | 'DAILY_COST_LIMIT'

export type ProjectBudgetAdmission = {
  admitted: boolean
  reason: ProjectBudgetAdmissionReason
  admissionId: string | null
  leaseId: string | null
  requestCountLastMinute: number
  activeConcurrency: number
  leaseExpiresAt: string | null
}

export type AcquireProjectBudgetAdmissionInput = {
  projectId: string
  policyVersionId: string
  correlationId: string
  leaseTtlSeconds?: number
}

export type ReleaseProjectBudgetLeaseInput = {
  projectId: string
  leaseId: string
  correlationId: string
}

export interface ProjectBudgetAdmissionProvider {
  acquire(input: AcquireProjectBudgetAdmissionInput): Promise<ProjectBudgetAdmission>
  release(input: ReleaseProjectBudgetLeaseInput): Promise<boolean>
}

export class ProjectBudgetAdmissionDeniedError extends Error {
  readonly reason: ProjectBudgetAdmissionReason

  constructor(reason: ProjectBudgetAdmissionReason) {
    super(`Project resource budget admission denied: ${reason}`)
    this.name = 'ProjectBudgetAdmissionDeniedError'
    this.reason = reason
  }
}
