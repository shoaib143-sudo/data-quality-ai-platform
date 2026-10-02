import assert from 'node:assert/strict'
import test from 'node:test'
import { invokeGovernedExternalCapability } from '../lib/agents/governed-external-capability-runtime.ts'

test('denied invocation never reaches external adapter', async () => {
  let invoked = false
  const result = await invokeGovernedExternalCapability({
    request: {
      capability: 'browser-use',
      explicitEnable: false,
      production: false,
      carriesSecrets: false,
      requestsPersistentWrite: false,
    },
    adapter: {
      capability: 'browser-use',
      async invoke() {
        invoked = true
        throw new Error('must not execute')
      },
    },
    payload: {},
    observedAt: '2026-10-03T00:00:00Z',
  })
  assert.equal(invoked, false)
  assert.equal(result.decision, 'DENIED')
  assert.equal(result.evidence, null)
})

test('adapter mismatch fails closed before execution', async () => {
  let invoked = false
  const result = await invokeGovernedExternalCapability({
    request: {
      capability: 'diagram-design',
      explicitEnable: true,
      production: false,
      carriesSecrets: false,
      requestsPersistentWrite: false,
    },
    adapter: {
      capability: 'claude-security',
      async invoke() {
        invoked = true
        return { sourceRevision: 'abcdef1', findings: [] }
      },
    },
    payload: {},
    observedAt: '2026-10-03T00:00:00Z',
  })
  assert.equal(invoked, false)
  assert.equal(result.reason, 'ADAPTER_CAPABILITY_MISMATCH')
})

test('allowed adapter output remains advisory and revision pinned', async () => {
  const result = await invokeGovernedExternalCapability({
    request: {
      capability: 'claude-security',
      explicitEnable: true,
      production: false,
      carriesSecrets: false,
      requestsPersistentWrite: false,
    },
    adapter: {
      capability: 'claude-security',
      async invoke() {
        return {
          sourceRevision: 'abcdef1234567',
          findings: [{ code: 'SEC-1', summary: 'Boundary review', severity: 'HIGH' }],
        }
      },
    },
    payload: { change: 'fixture' },
    observedAt: '2026-10-03T00:00:00Z',
  })
  assert.equal(result.decision, 'ALLOWED')
  assert.equal(result.evidence?.advisory, true)
  assert.equal(result.evidence?.authoritative, false)
  assert.equal(result.evidence?.sourceRevision, 'abcdef1234567')
})

test('invalid unpinned adapter revision fails closed', async () => {
  await assert.rejects(() => invokeGovernedExternalCapability({
    request: {
      capability: 'diagram-design',
      explicitEnable: true,
      production: false,
      carriesSecrets: false,
      requestsPersistentWrite: false,
    },
    adapter: {
      capability: 'diagram-design',
      async invoke() {
        return { sourceRevision: 'latest', findings: [] }
      },
    },
    payload: {},
    observedAt: '2026-10-03T00:00:00Z',
  }), /pinned revision/)
})
