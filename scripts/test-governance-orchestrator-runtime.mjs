import assert from 'node:assert/strict'
import test from 'node:test'
import { assertLeaseGeneration, assertNodeTransition, validateExecutionPlan } from '../lib/orchestration/governance-orchestrator-runtime.ts'

const node = (executionKey, overrides = {}) => ({
  executionKey,
  capabilityKey: executionKey,
  dependencies: [],
  state: 'PENDING',
  attempt: 1,
  leaseGeneration: 0,
  policyVersion: 'v1',
  inputHash: 'sha256:test',
  evidenceRequirements: ['canonical_evidence'],
  timeoutMs: 30_000,
  retryClass: 'TRANSIENT_SAFE',
  compensationAction: null,
  ...overrides,
})

test('accepts an acyclic dependency plan', () => {
  const errors = validateExecutionPlan([
    node('source'),
    node('profiling', { dependencies: ['source'] }),
    node('quality', { dependencies: ['profiling'] }),
  ])
  assert.deepEqual(errors, [])
})

test('rejects unknown dependencies and dependency cycles', () => {
  const unknown = validateExecutionPlan([node('a', { dependencies: ['missing'] })])
  assert.ok(unknown.some(error => error.includes('unknown dependency')))

  const cycle = validateExecutionPlan([
    node('a', { dependencies: ['b'] }),
    node('b', { dependencies: ['a'] }),
  ])
  assert.ok(cycle.some(error => error.includes('Dependency cycle detected')))
})

test('rejects illegal state transitions', () => {
  assert.throws(() => assertNodeTransition('PENDING', 'SUCCEEDED'), /Illegal orchestrator node transition/)
  assert.doesNotThrow(() => assertNodeTransition('PENDING', 'READY'))
})

test('rejects stale execution fencing generations', () => {
  assert.doesNotThrow(() => assertLeaseGeneration(7, 7))
  assert.throws(() => assertLeaseGeneration(8, 7), /Stale execution lease/)
})
