export type LearningEvaluationRuntimeVariant = 'BASELINE' | 'CANDIDATE'

export type LearningEvaluationRuntimeContext = {
  policyId: string
  candidateId: string
  variant: LearningEvaluationRuntimeVariant
}

export type LearningEvaluationRuntimeReservation = {
  reservationId: string
  pricingVersionId: string
  reservedCostUsd: number
  reservedTokens: number
  latencyMsBudget: number
}

export type LearningEvaluationRuntimeEventStatus =
  | 'RELEASED'
  | 'RECONCILED'
  | 'UNRESOLVED'
  | 'EXCEEDED'

export type LearningEvaluationRuntimeEvent = {
  eventId: string
  status: LearningEvaluationRuntimeEventStatus
  eventSequence: number
}

export interface LearningEvaluationRuntimeBudgetProvider {
  reserve(input: {
    projectId: string
    policyId: string
    candidateId: string
    variant: LearningEvaluationRuntimeVariant
    invocationId: string
    executionCorrelationId: string
    providerId: string
    modelName: string
  }): Promise<LearningEvaluationRuntimeReservation>

  recordEvent(input: {
    projectId: string
    policyId: string
    reservationId: string
    releaseWithoutProviderCall: boolean
    accountingComplete: boolean
    actualCostUsd?: number | null
    actualTokens?: number | null
    actualLatencyMs?: number | null
    reason: string
  }): Promise<LearningEvaluationRuntimeEvent>
}
