import assert from 'node:assert/strict'
import test from 'node:test'
import { DecisionGateway, decisionStateFingerprint } from '../lib/ai/decision-gateway.ts'
import { DecisionPayloadBuilder } from '../lib/ai/decision-payload-builder.ts'
import { BUILTIN_DECISION_DEFINITIONS } from '../lib/ai/decision-registry.ts'

test('decision payload builder removes common secret-bearing keys', () => {
  const payload = new DecisionPayloadBuilder().build({
    sql: 'select 1',
    apiKey: 'secret',
    nested: { authorization: 'Bearer hidden', safe: 'kept' },
  })
  assert.deepEqual(payload, { sql: 'select 1', nested: { safe: 'kept' } })
})

test('fingerprint is stable across object key order', () => {
  assert.equal(decisionStateFingerprint({ a: 1, b: 2 }), decisionStateFingerprint({ b: 2, a: 1 }))
})

test('all builtin decisions start non-enforcing', () => {
  for (const definition of Object.values(BUILTIN_DECISION_DEFINITIONS)) {
    assert.equal(definition.lifecycle, 'SHADOW')
    assert.equal(definition.enforcementEligible, false)
  }
})

test('confident Jev-style result remains shadow-only until explicit promotion', async () => {
  const provider = {
    id: 'fake_jev',
    state: 'AVAILABLE',
    async evaluate(request) {
      return {
        provider: 'fake_jev',
        model: 'jev-test',
        answers: Object.fromEntries(Object.entries(request.questions).map(([name, question]) => {
          if (question.type === 'noul') return [name, { type: 'noul', noul: 0.99 }]
          if (question.type === 'choice') return [name, { type: 'choice', choice: Object.keys(question.criteria)[0], confidence: 0.99, probabilities: Object.fromEntries(Object.keys(question.criteria).map((key, index) => [key, index === 0 ? 0.99 : 0.01 / Math.max(1, Object.keys(question.criteria).length - 1)])) }]
          return [name, { type: 'score', score: 0, confidence: 0.99, legend: { 0: 'low' }, probabilities: { 0: 0.99 } }]
        })),
        usage: { inputTokens: 10, outputTokens: 2 },
        latencyMs: 1,
      }
    },
  }
  const gateway = new DecisionGateway({ provider })
  const receipt = await gateway.evaluate({
    definition: BUILTIN_DECISION_DEFINITIONS.TOOL_RISK,
    state: { tool: 'sql', query: 'select 1' },
  })
  assert.equal(receipt.policy.band, 'CONFIDENT')
  assert.equal(receipt.policy.enforcementEligible, false)
  assert.equal(receipt.enforcementResult, 'SHADOW_ONLY')
})

test('unavailable provider fails closed for safety families', async () => {
  const provider = {
    id: 'offline',
    state: 'UNAVAILABLE',
    async evaluate() { throw new Error('must not be called') },
  }
  const gateway = new DecisionGateway({ provider })
  await assert.rejects(
    () => gateway.evaluate({ definition: BUILTIN_DECISION_DEFINITIONS.PROMPT_SECURITY, state: { text: 'x' } }),
    /fails closed/,
  )
})


test('runtime status is bypassed and non-enforcing when Jev is unconfigured', async () => {
  const previous = process.env.JEV_API_KEY
  delete process.env.JEV_API_KEY
  const { readDecisionRuntimeStatus } = await import('../lib/ai/decision-runtime.ts')
  const state = readDecisionRuntimeStatus()
  assert.equal(state.configured, false)
  assert.equal(state.providerState, 'BYPASSED')
  assert.equal(state.enforcementEnabled, false)
  if (previous == null) delete process.env.JEV_API_KEY
  else process.env.JEV_API_KEY = previous
})

test('decision control plane exposes all P0 families with closed authority', async () => {
  const { readDecisionControlPlaneState } = await import('../lib/ai/decision-control-plane-state.ts')
  const state = readDecisionControlPlaneState()
  assert.equal(state.counts.total, 5)
  assert.equal(state.counts.shadow, 5)
  assert.equal(state.counts.enforcementEligible, 0)
  assert.deepEqual(state.authority, {
    semanticMayGrantCapability: false,
    semanticMayOverrideDeny: false,
    semanticMayApproveMutation: false,
    semanticMayPromoteEvidence: false,
  })
})
