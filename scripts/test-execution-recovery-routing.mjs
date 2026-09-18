import assert from 'node:assert/strict'

import {
  classifyTerminalRecoveryRoute,
  recoveryStageFromFailure,
  recoveryUnsafeFlags,
} from '../lib/orchestration/execution-recovery-routing.ts'

assert.deepEqual(
  classifyTerminalRecoveryRoute('PROFILING', 'PROFILE_READINESS_GATE_BLOCKED during metric execution'),
  { repairClass: 'PROFILING_READINESS_RECONCILIATION', stage: 'METRIC_EXECUTION' },
)

assert.deepEqual(
  classifyTerminalRecoveryRoute('DISCOVERY', 'JDBC connection timeout while validating source'),
  { repairClass: 'SOURCE_READINESS_RECONCILIATION', stage: 'CONNECTOR_ESTABLISHMENT' },
)

assert.deepEqual(
  classifyTerminalRecoveryRoute('PROFILING', 'worker lease expired while processing profiling job'),
  { repairClass: 'LEASE_RECONCILIATION', stage: 'GOVERNED_WORKFLOW' },
)

assert.deepEqual(
  classifyTerminalRecoveryRoute('PROFILING', 'missing credential secret for source'),
  { repairClass: null, stage: 'PROFILE_RUN' },
)

assert.deepEqual(
  classifyTerminalRecoveryRoute('DISCOVERY', 'cross-tenant security violation during JDBC discovery'),
  { repairClass: null, stage: 'CONNECTOR_ESTABLISHMENT' },
)

assert.equal(
  classifyTerminalRecoveryRoute('NOTIFICATION', 'worker lease expired during notification'),
  null,
)

assert.equal(
  classifyTerminalRecoveryRoute('PROFILING', 'unknown parser defect'),
  null,
)

assert.equal(recoveryStageFromFailure('PROFILING', 'schema discovery failed'), 'SCHEMA_DISCOVERY')
assert.equal(recoveryStageFromFailure('PROFILING', 'profile column registration failed'), 'PROFILE_COLUMNS')
assert.equal(recoveryStageFromFailure('PROFILING', 'metric persistence blocked'), 'METRIC_EXECUTION')
assert.equal(recoveryStageFromFailure('PROFILING', 'profile run creation failed'), 'PROFILE_RUN')

assert.deepEqual(
  recoveryUnsafeFlags('missing credential secret for source'),
  {
    credentialMissing: true,
    privilegeExpansionRequired: false,
    destructiveMutationRequired: false,
    policyBlocked: false,
    securityRelevant: false,
  },
)

assert.equal(recoveryUnsafeFlags('policy blocked: approval required').policyBlocked, true)
assert.equal(recoveryUnsafeFlags('requires elevated privilege').privilegeExpansionRequired, true)
assert.equal(recoveryUnsafeFlags('DROP TABLE production_data').destructiveMutationRequired, true)
assert.equal(recoveryUnsafeFlags('cross-tenant security violation').securityRelevant, true)

console.log('Execution Recovery Agent terminal routing tests passed.')
