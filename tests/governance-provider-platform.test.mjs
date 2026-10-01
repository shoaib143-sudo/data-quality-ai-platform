import './governance-provider-planning.test.mjs'
import './governance-provider-runtime.test.mjs'
import './governance-provider-execution.test.mjs'
import './governance-provider-assurance.test.mjs'
import './governance-provider-failure-paths.test.mjs'

import assert from 'node:assert/strict'
import test from 'node:test'

import { diffGovernanceState } from '../lib/governance-platform/planning/diff.ts'
import {
  clearGovernanceProvidersForTests,
  getGovernanceProvider,
  listGovernanceProviders,
  registerGovernanceProvider,
} from '../lib/governance-platform/providers/registry.ts'

const base = {
  id: 'term-customer',
  type: 'BUSINESS_TERM',
  externalKey: 'customer',
  name: 'Customer',
  projectId: 'project-1',
  attributes: {},
  relationships: [],
  version: 1,
}

test('desired-state diff is idempotent for identical state', () => {
  const result = diffGovernanceState([base], [base])
  assert.equal(result[0].action, 'NOOP')
})

test('absence never implies deletion', () => {
  const result = diffGovernanceState([], [base])
  assert.deepEqual(result, [])
})

test('explicit absent state produces deletion only when object exists', () => {
  const result = diffGovernanceState([{ ...base, state: 'absent' }], [base])
  assert.equal(result[0].action, 'DELETE')
})

test('provider registry is provider neutral and rejects duplicate registration', () => {
  clearGovernanceProvidersForTests()
  const provider = {
    manifest: () => ({
      provider: 'informatica',
      providerVersion: '0.1.0',
      canonicalSchemaVersion: '1.0',
      capabilities: [],
    }),
    capabilities: async () => [],
    discover: async () => ({ objects: [], observedAt: new Date(0).toISOString() }),
    execute: async operation => ({ operationId: operation.operationId, status: 'SUCCEEDED' }),
    verify: async operation => ({ operationId: operation.operationId, status: 'VERIFIED' }),
  }

  registerGovernanceProvider(provider)
  assert.equal(getGovernanceProvider('INFORMATICA'), provider)
  assert.equal(listGovernanceProviders().length, 1)
  assert.throws(() => registerGovernanceProvider(provider), /already registered/)
  clearGovernanceProvidersForTests()
})
