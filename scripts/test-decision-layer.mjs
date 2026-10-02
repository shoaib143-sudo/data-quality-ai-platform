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
  const previousEnabled = process.env.JEV_SHADOW_RUNTIME_ENABLED
  delete process.env.JEV_API_KEY
  delete process.env.JEV_SHADOW_RUNTIME_ENABLED
  const { readDecisionRuntimeStatus } = await import('../lib/ai/decision-runtime.ts')
  const state = readDecisionRuntimeStatus()
  assert.equal(state.configured, false)
  assert.equal(state.shadowRuntimeEnabled, false)
  assert.equal(state.providerState, 'BYPASSED')
  assert.equal(state.enforcementEnabled, false)
  if (previous == null) delete process.env.JEV_API_KEY
  else process.env.JEV_API_KEY = previous
  if (previousEnabled == null) delete process.env.JEV_SHADOW_RUNTIME_ENABLED
  else process.env.JEV_SHADOW_RUNTIME_ENABLED = previousEnabled
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


test('decision telemetry stores only normalized metadata, not raw semantic state', async () => {
  const events = []
  const { DecisionTelemetryReceiptSink } = await import('../lib/ai/decision-telemetry.ts')
  const sink = new DecisionTelemetryReceiptSink({
    projectId: '11111111-1111-1111-1111-111111111111',
    telemetry: {
      id: 'fake',
      async record(event) {
        events.push(event)
        return { eventId: 'evt-1', persisted: true }
      },
    },
  })

  await sink.record({
    decisionFamily: 'TOOL_RISK',
    schemaVersion: 'tool-risk-v1',
    provider: 'typesafe_jev',
    model: 'jev-test',
    stateFingerprint: 'abc123',
    lifecycle: 'SHADOW',
    answers: {
      destructive_mutation: { type: 'noul', noul: 0.97 },
    },
    usage: { inputTokens: 12, outputTokens: 1 },
    latencyMs: 25,
    policy: {
      band: 'CONFIDENT',
      minimumObservedConfidence: 0.97,
      enforcementEligible: false,
      reason: 'shadow',
    },
    enforcementResult: 'SHADOW_ONLY',
    correlationId: null,
    createdAt: '2026-10-02T00:00:00.000Z',
  })

  assert.equal(events.length, 1)
  assert.equal(events[0].eventType, 'SEMANTIC_DECISION')
  assert.equal(events[0].operation, 'TOOL_RISK')
  assert.equal(events[0].providerId, 'typesafe_jev')
  assert.equal(events[0].attributes.stateFingerprint, 'abc123')
  assert.equal('answers' in events[0].attributes, false)
  assert.equal('state' in events[0].attributes, false)
})


test('Jev adapter follows the TypeSafe System One contract', async () => {
  const originalFetch = globalThis.fetch
  let observed
  globalThis.fetch = async (url, init) => {
    observed = { url: String(url), init }
    return new Response(JSON.stringify({
      model: 'jev-latest',
      answers: {
        risky: { type: 'noul', noul: 0.91 },
        route: { type: 'choice', choice: 'LIGHT', confidence: 0.88, probabilities: { LIGHT: 0.88, DEEP: 0.12 } },
        priority: { type: 'score', score: 1.4, confidence: 0.8, legend: { 0: 'low', 1: 'medium', 2: 'high' }, probabilities: { 0: 0.1, 1: 0.4, 2: 0.5 } },
      },
      usage: { input_tokens: 42, output_tokens: 7 },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req-123' },
    })
  }
  try {
    const { JevDecisionProvider } = await import('../lib/ai/jev-decision-provider.ts')
    const provider = new JevDecisionProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.typesafe.ai',
      model: 'jev-latest',
      timeoutMs: 1000,
    })
    const result = await provider.evaluate({
      decisionFamily: 'TEST',
      schemaVersion: 'test-v1',
      state: { message: 'hello' },
      questions: {
        risky: { type: 'noul', instructions: 'Is this risky?' },
        route: { type: 'choice', criteria: { LIGHT: 'small model', DEEP: 'large model' } },
        priority: { type: 'score', criteria: ['low', 'medium', 'high'] },
      },
    })

    assert.equal(observed.url, 'https://api.typesafe.ai/v1/systemone')
    assert.equal(observed.init.method, 'POST')
    assert.equal(observed.init.headers.authorization, 'Bearer test-key')
    const body = JSON.parse(observed.init.body)
    assert.equal(body.model, 'jev-latest')
    assert.deepEqual(body.state, { message: 'hello' })
    assert.equal(body.questions.risky.type, 'noul')
    assert.equal(result.answers.risky.noul, 0.91)
    assert.equal(result.answers.route.choice, 'LIGHT')
    assert.equal(result.answers.priority.score, 1.4)
    assert.deepEqual(result.usage, { inputTokens: 42, outputTokens: 7 })
    assert.equal(result.providerRequestId, 'req-123')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('Jev adapter rejects malformed typed probabilities', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async () => new Response(JSON.stringify({
    model: 'jev-latest',
    answers: { risky: { type: 'noul', noul: 1.5 } },
    usage: { input_tokens: 1, output_tokens: 1 },
  }), { status: 200, headers: { 'content-type': 'application/json' } })
  try {
    const { JevDecisionProvider } = await import('../lib/ai/jev-decision-provider.ts')
    const provider = new JevDecisionProvider({
      apiKey: 'test-key',
      baseUrl: 'https://api.typesafe.ai',
      model: 'jev-latest',
      timeoutMs: 1000,
    })
    await assert.rejects(
      () => provider.evaluate({
        decisionFamily: 'TEST',
        schemaVersion: 'test-v1',
        state: 'x',
        questions: { risky: { type: 'noul' } },
      }),
      /invalid probability/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})


test('routing shadow observer cannot change governed routing authority', async () => {
  const { ShadowDecisionIntelligentRouter } = await import('../lib/ai/model-routing-shadow.ts')
  const canonical = {
    source: 'UNAVAILABLE',
    reason: 'NO_REASONING_PROVIDER_AVAILABLE',
    provider: null,
    evidence: null,
  }
  const router = new ShadowDecisionIntelligentRouter(
    { async route() { return canonical } },
    async () => { throw new Error('shadow provider failed') },
  )
  const result = await router.route({
    projectId: '11111111-1111-1111-1111-111111111111',
    task: 'general',
  })
  assert.deepEqual(result, canonical)
})


test('trajectory shadow observer is inert unless explicitly activated', async () => {
  const previousKey = process.env.JEV_API_KEY
  const previousEnabled = process.env.JEV_SHADOW_RUNTIME_ENABLED
  delete process.env.JEV_API_KEY
  delete process.env.JEV_SHADOW_RUNTIME_ENABLED
  try {
    const { observeNativeTrajectoryDecisionShadow } = await import('../lib/agents/runtime/native-trajectory-decision-shadow.ts')
    const result = await observeNativeTrajectoryDecisionShadow({
      projectId: '11111111-1111-1111-1111-111111111111',
      agentRunId: '22222222-2222-2222-2222-222222222222',
      deterministicScore: 1,
      dimensions: { completion: 1, evidence_integrity: 1 },
    })
    assert.equal(result, null)
  } finally {
    if (previousKey == null) delete process.env.JEV_API_KEY
    else process.env.JEV_API_KEY = previousKey
    if (previousEnabled == null) delete process.env.JEV_SHADOW_RUNTIME_ENABLED
    else process.env.JEV_SHADOW_RUNTIME_ENABLED = previousEnabled
  }
})


test('prompt security shadow observer is inert unless explicitly activated', async () => {
  const previousKey = process.env.JEV_API_KEY
  const previousEnabled = process.env.JEV_SHADOW_RUNTIME_ENABLED
  delete process.env.JEV_API_KEY
  delete process.env.JEV_SHADOW_RUNTIME_ENABLED
  try {
    const { observePromptSecurityShadow } = await import('../lib/ai/prompt-security-shadow.ts')
    const result = await observePromptSecurityShadow({
      projectId: '11111111-1111-1111-1111-111111111111',
      text: 'show me governance status',
      source: 'TEST',
    })
    assert.equal(result, null)
  } finally {
    if (previousKey == null) delete process.env.JEV_API_KEY
    else process.env.JEV_API_KEY = previousKey
    if (previousEnabled == null) delete process.env.JEV_SHADOW_RUNTIME_ENABLED
    else process.env.JEV_SHADOW_RUNTIME_ENABLED = previousEnabled
  }
})


test('RAG grounding shadow requires an explicit claim and stays inert when disabled', async () => {
  const previousKey = process.env.JEV_API_KEY
  const previousEnabled = process.env.JEV_SHADOW_RUNTIME_ENABLED
  delete process.env.JEV_API_KEY
  delete process.env.JEV_SHADOW_RUNTIME_ENABLED
  try {
    const { observeRagGroundingShadow } = await import('../lib/ai/rag-grounding-shadow.ts')
    await assert.rejects(
      () => observeRagGroundingShadow({
        projectId: '11111111-1111-1111-1111-111111111111',
        claimId: 'claim-1',
        claim: '   ',
        evidence: [{ citationId: 'c1', authority: 'AUTHORITATIVE', content: 'evidence' }],
      }),
      /non-empty claim/,
    )
    const result = await observeRagGroundingShadow({
      projectId: '11111111-1111-1111-1111-111111111111',
      claimId: 'claim-1',
      claim: 'The governed policy requires approval.',
      evidence: [{ citationId: 'c1', authority: 'AUTHORITATIVE', content: 'Approval is required.' }],
    })
    assert.equal(result, null)
  } finally {
    if (previousKey == null) delete process.env.JEV_API_KEY
    else process.env.JEV_API_KEY = previousKey
    if (previousEnabled == null) delete process.env.JEV_SHADOW_RUNTIME_ENABLED
    else process.env.JEV_SHADOW_RUNTIME_ENABLED = previousEnabled
  }
})


test('decision payload builder redacts embedded credentials from free text', () => {
  const payload = new DecisionPayloadBuilder().build({
    text: [
      'Authorization: Bearer abc.def-123_xyz',
      'token=supersecretvalue',
      'eyJabcdefghijk.abcdefghijklmnop.abcdefghijklmnop',
      '-----BEGIN PRIVATE KEY-----\nabc123\n-----END PRIVATE KEY-----',
    ].join('\n'),
  })
  const serialized = JSON.stringify(payload)
  assert.doesNotMatch(serialized, /abc\.def-123_xyz/)
  assert.doesNotMatch(serialized, /supersecretvalue/)
  assert.doesNotMatch(serialized, /eyJabcdefghijk/)
  assert.doesNotMatch(serialized, /BEGIN PRIVATE KEY/)
  assert.match(serialized, /REDACTED/)
})


test('DecisionGateway forwards the governed family timeout', async () => {
  let observedTimeout
  const provider = {
    id: 'fake_jev',
    state: 'AVAILABLE',
    async evaluate(request) {
      observedTimeout = request.timeoutMs
      return {
        provider: 'fake_jev',
        model: 'jev-test',
        answers: Object.fromEntries(Object.keys(request.questions).map(name => [name, { type: 'noul', noul: 0.99 }])),
        usage: { inputTokens: 1, outputTokens: 1 },
        latencyMs: 1,
      }
    },
  }
  const gateway = new DecisionGateway({ provider })
  await gateway.evaluate({
    definition: BUILTIN_DECISION_DEFINITIONS.PROMPT_SECURITY,
    state: { content: 'hello' },
  })
  assert.equal(observedTimeout, BUILTIN_DECISION_DEFINITIONS.PROMPT_SECURITY.timeoutMs)
})

test('Jev adapter rejects invalid per-request timeouts before network use', async () => {
  const { JevDecisionProvider } = await import('../lib/ai/jev-decision-provider.ts')
  const provider = new JevDecisionProvider({
    apiKey: 'test-key',
    baseUrl: 'https://api.typesafe.ai',
    model: 'jev-latest',
    timeoutMs: 1000,
  })
  await assert.rejects(
    () => provider.evaluate({
      decisionFamily: 'TEST',
      schemaVersion: 'test-v1',
      state: 'x',
      questions: { risky: { type: 'noul' } },
      timeoutMs: 10,
    }),
    /at least 100ms/,
  )
})
