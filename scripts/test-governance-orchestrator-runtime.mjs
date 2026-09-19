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

test('rejects unknown dependencies, self-dependencies, and dependency cycles', () => {
  assert.ok(validateExecutionPlan([node('a', { dependencies: ['missing'] })]).some(error => error.includes('unknown dependency')))
  assert.ok(validateExecutionPlan([node('self', { dependencies: ['self'] })]).some(error => error.includes('cannot depend on itself')))
  const cycle = validateExecutionPlan([
    node('a', { dependencies: ['b'] }),
    node('b', { dependencies: ['a'] }),
  ])
  assert.ok(cycle.some(error => error.includes('Dependency cycle detected')))
})

test('rejects malformed execution metadata before runtime admission', () => {
  const errors = validateExecutionPlan([
    node('bad', {
      attempt: 0,
      leaseGeneration: -1,
      timeoutMs: Number.POSITIVE_INFINITY,
      policyVersion: '',
      inputHash: '',
      evidenceRequirements: ['canonical_evidence', 'canonical_evidence'],
    }),
  ])
  assert.ok(errors.some(error => error.includes('attempt')))
  assert.ok(errors.some(error => error.includes('lease generation')))
  assert.ok(errors.some(error => error.includes('timeout')))
  assert.ok(errors.some(error => error.includes('policy version')))
  assert.ok(errors.some(error => error.includes('input hash')))
  assert.ok(errors.some(error => error.includes('evidence requirements')))
})

test('rejects illegal state transitions and terminal-state resurrection', () => {
  assert.throws(() => assertNodeTransition('PENDING', 'SUCCEEDED'), /Illegal orchestrator node transition/)
  assert.throws(() => assertNodeTransition('SUCCEEDED', 'READY'), /Illegal orchestrator node transition/)
  assert.throws(() => assertNodeTransition('ROLLED_BACK', 'RUNNING'), /Illegal orchestrator node transition/)
  assert.doesNotThrow(() => assertNodeTransition('PENDING', 'READY'))
  assert.doesNotThrow(() => assertNodeTransition('FAILED', 'COMPENSATING'))
})

test('rejects stale and malformed execution fencing generations', () => {
  assert.doesNotThrow(() => assertLeaseGeneration(7, 7))
  assert.throws(() => assertLeaseGeneration(8, 7), /Stale execution lease/)
  assert.throws(() => assertLeaseGeneration(-1, -1), /non-negative integers/)
  assert.throws(() => assertLeaseGeneration(1.5, 1.5), /non-negative integers/)
})
