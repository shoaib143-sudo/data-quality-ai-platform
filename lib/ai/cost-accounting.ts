import type { ReasoningUsage } from './reasoning-provider'

export type ModelCostAccountingStatus = 'PRICED' | 'USAGE_UNAVAILABLE' | 'PRICE_UNAVAILABLE'

export type ModelCostAccountingRecord = {
  id: string
  invocationId: string
  projectId: string
  executionCorrelationId: string | null
  providerRequestId: string | null
  providerId: string
  modelName: string
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  pricingVersionId: string | null
  currency: string | null
  inputCost: string | null
  outputCost: string | null
  totalCost: string | null
  accountingStatus: ModelCostAccountingStatus
  observedAt: string
  recordedAt: string
}

export type RecordModelCostInput = {
  invocationId: string
  projectId: string
  executionCorrelationId?: string | null
  providerRequestId?: string | null
  providerId: string
  modelName: string
  usage?: ReasoningUsage
  observedAt: string
}

/**
 * Persists canonical cost evidence for one completed model invocation.
 * Implementations must never estimate token usage or substitute default prices.
 */
export interface ModelCostAccountingProvider {
  recordInvocation(input: RecordModelCostInput): Promise<ModelCostAccountingRecord>
}
