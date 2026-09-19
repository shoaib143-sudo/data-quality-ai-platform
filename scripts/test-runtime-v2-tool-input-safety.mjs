import assert from 'node:assert/strict'
import {
  assertNativeToolRawInputSafety,
  nativeToolInputAliases,
} from '../lib/agents/runtime/native-tool-input-safety.ts'

assert.deepEqual(nativeToolInputAliases('dataset_id'), ['dataset_id', 'datasetId'])
assert.deepEqual(nativeToolInputAliases('datasetId'), ['datasetId', 'dataset_id'])

assert.doesNotThrow(() => assertNativeToolRawInputSafety({
  propertyKeys: ['dataset_id'],
  additionalProperties: false,
  rawInput: { dataset_id: 'x' },
  toolKey: 'example_tool',
}))

assert.doesNotThrow(() => assertNativeToolRawInputSafety({
  propertyKeys: ['dataset_id'],
  additionalProperties: false,
  rawInput: { datasetId: 'x' },
  toolKey: 'example_tool',
}))

assert.throws(() => assertNativeToolRawInputSafety({
  propertyKeys: ['dataset_id'],
  additionalProperties: false,
  rawInput: { dataset_id: 'x', injected_admin_override: true },
  toolKey: 'example_tool',
}), /undeclared raw properties are not allowed: injected_admin_override/)

assert.throws(() => assertNativeToolRawInputSafety({
  propertyKeys: ['dataset_id'],
  additionalProperties: false,
  rawInput: { dataset_id: 'safe', datasetId: 'different' },
  toolKey: 'example_tool',
}), /conflicting aliases supplied for dataset_id/)

assert.doesNotThrow(() => assertNativeToolRawInputSafety({
  propertyKeys: ['metadata'],
  additionalProperties: true,
  rawInput: { metadata: {}, extension: 'permitted-by-contract' },
  toolKey: 'extensible_tool',
}))

console.log('Runtime v2 raw tool input fail-closed cases verified.')
