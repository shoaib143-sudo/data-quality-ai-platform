import assert from 'node:assert/strict'
import { certifyNativeRollbackContract } from '../lib/agents/runtime/native-rollback-contract.ts'

assert.deepEqual(
  certifyNativeRollbackContract({
    config: {},
    toolKey: 'read_tool',
    readOnly: true,
    reversible: false,
    compensatable: false,
  }),
  { rollbackStrategy: 'NOT_APPLICABLE' },
)

assert.throws(
  () => certifyNativeRollbackContract({
    config: {},
    toolKey: 'write_tool',
    readOnly: false,
    reversible: false,
    compensatable: false,
  }),
  /mutating tool requires rollback_strategy COMPENSATION_TOOL or ESCALATE_ONLY/,
)

assert.deepEqual(
  certifyNativeRollbackContract({
    config: { rollback_strategy: 'ESCALATE_ONLY' },
    toolKey: 'evidence_write',
    readOnly: false,
    reversible: false,
    compensatable: false,
  }),
  { rollbackStrategy: 'ESCALATE_ONLY' },
)

assert.throws(
  () => certifyNativeRollbackContract({
    config: { rollback_strategy: 'ESCALATE_ONLY', compensation_tool_key: 'undo' },
    toolKey: 'evidence_write',
    readOnly: false,
    reversible: false,
    compensatable: false,
  }),
  /ESCALATE_ONLY cannot claim reversible\/compensatable execution or a compensation tool/,
)

assert.throws(
  () => certifyNativeRollbackContract({
    config: { rollback_strategy: 'COMPENSATION_TOOL' },
    toolKey: 'write_tool',
    readOnly: false,
    reversible: false,
    compensatable: true,
  }),
  /COMPENSATION_TOOL requires compensation_tool_key/,
)

assert.deepEqual(
  certifyNativeRollbackContract({
    config: {
      rollback_strategy: 'COMPENSATION_TOOL',
      compensation_tool_key: 'undo_write',
    },
    toolKey: 'write_tool',
    readOnly: false,
    reversible: false,
    compensatable: true,
  }),
  { rollbackStrategy: 'COMPENSATION_TOOL', compensationToolKey: 'undo_write' },
)

console.log('Native rollback contract behavior verified.')
