import { validateJdbcConnection, type JdbcConnectionConfig, type JdbcValidationResult } from '@/lib/connectors/jdbc'
import type { RecoveryFailureContext } from './execution-recovery-contract'
import type { RecoveryHandler } from './execution-recovery-runtime'

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function jdbcConfig(context: RecoveryFailureContext): JdbcConnectionConfig | null {
  const params = record(context.repairParameters)
  const raw = record(params.jdbcConfig)
  const jdbcUrl = stringValue(raw.jdbcUrl ?? raw.jdbc_url)
  const credentialRef = stringValue(raw.credentialRef ?? raw.credential_ref)
  const table = stringValue(raw.table)
  if (!jdbcUrl || !credentialRef || !table) return null
  return {
    jdbcUrl,
    credentialRef,
    table,
    schema: stringValue(raw.schema),
    catalog: stringValue(raw.catalog),
  }
}

export function createConnectorRecoveryHandler(input?: {
  validate?: (config: JdbcConnectionConfig) => Promise<JdbcValidationResult>
}): RecoveryHandler {
  const validate = input?.validate ?? validateJdbcConnection
  const validationByCase = new Map<string, JdbcValidationResult>()

  return {
    key: 'connector-establishment-retry',

    canHandle(context) {
      return context.failingStage === 'CONNECTOR_ESTABLISHMENT'
        && context.knownRepairClass === 'TRANSIENT_RETRY'
        && jdbcConfig(context) !== null
    },

    async diagnose(context) {
      if (!jdbcConfig(context)) throw new Error('Connector recovery requires a complete JDBC configuration reference.')
      return {
        rootCause: `Persisted connector evidence classifies ${context.code ?? 'the failure'} as retry-safe and transient.`,
        repairClass: 'TRANSIENT_RETRY',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    async proposeRepair(context) {
      const config = jdbcConfig(context)
      if (!config) throw new Error('Connector recovery requires a complete JDBC configuration reference.')
      return {
        repairClass: 'TRANSIENT_RETRY',
        toolKey: 'validateJdbcConnection',
        mutationScope: `project:${context.projectId}:connector-validation`,
        payload: { jdbcUrl: config.jdbcUrl, credentialRef: config.credentialRef, table: config.table, schema: config.schema, catalog: config.catalog },
      }
    },

    async apply(context) {
      const config = jdbcConfig(context)
      if (!config) throw new Error('Connector recovery requires a complete JDBC configuration reference.')
      const result = await validate(config)
      validationByCase.set(context.recoveryCaseId, result)
      return { mutationId: `connector-validation:${context.recoveryCaseId}` }
    },

    async validate(context) {
      const result = validationByCase.get(context.recoveryCaseId)
      if (!result) return { valid: false, code: 'CONNECTOR_VALIDATION_EVIDENCE_MISSING' }
      return {
        valid: result.valid === true && result.errors.length === 0,
        code: result.valid === true && result.errors.length === 0 ? 'CONNECTOR_REESTABLISHED' : 'CONNECTOR_STILL_UNAVAILABLE',
        evidenceIds: context.evidence.map(item => item.id),
      }
    },

    sameStageRetrySafe() {
      return true
    },
  }
}
