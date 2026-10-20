export type CapabilitySupport = 'FULL' | 'PARTIAL' | 'READ_ONLY' | 'UNSUPPORTED'
export type CapabilityMode = 'READ' | 'CREATE' | 'UPDATE' | 'DELETE' | 'BULK' | 'SIMULATE'
export type ProviderConsistency = 'STRONG' | 'EVENTUAL'
export type ProviderExecutionMode = 'SYNC' | 'ASYNC'
export type ProviderIdempotency = 'NATIVE' | 'DATANEXUS_MANAGED' | 'NONE'
export type ProviderRollback = 'NATIVE' | 'COMPENSATING' | 'NONE'
export type ProviderVerification = 'READ_BACK' | 'JOB_STATUS' | 'EVENT' | 'MANUAL'

export type ProviderCapability = {
  capability: string
  support: CapabilitySupport
  modes: CapabilityMode[]
  consistency: ProviderConsistency
  execution: ProviderExecutionMode
  idempotency: ProviderIdempotency
  rollback: ProviderRollback
  verification: ProviderVerification
  constraints?: {
    maxBatchSize?: number
    maxConcurrency?: number
    rateLimitHint?: number
  }
  apiVersion?: string
  limitations?: string[]
}
