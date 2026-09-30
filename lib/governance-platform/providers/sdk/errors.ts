export type GovernanceProviderErrorCode =
  | 'AUTHENTICATION_FAILED'
  | 'AUTHORIZATION_DENIED'
  | 'VALIDATION_FAILED'
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'TRANSIENT_FAILURE'
  | 'PROVIDER_UNAVAILABLE'
  | 'UNSUPPORTED_CAPABILITY'
  | 'PARTIAL_FAILURE'
  | 'VERIFICATION_FAILED'

export class GovernanceProviderError extends Error {
  readonly code: GovernanceProviderErrorCode
  readonly retryable: boolean
  readonly details?: Record<string, unknown>

  constructor(
    code: GovernanceProviderErrorCode,
    message: string,
    options: { retryable?: boolean; details?: Record<string, unknown> } = {},
  ) {
    super(message)
    this.name = 'GovernanceProviderError'
    this.code = code
    this.retryable = options.retryable ?? ['RATE_LIMITED', 'TRANSIENT_FAILURE', 'PROVIDER_UNAVAILABLE'].includes(code)
    this.details = options.details
  }
}
