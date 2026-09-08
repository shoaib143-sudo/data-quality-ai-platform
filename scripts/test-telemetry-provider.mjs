import assert from 'node:assert/strict'

const { DurableTelemetryProvider } = await import('../lib/ai/telemetry-provider.ts')

const inserted = []
const provider = new DurableTelemetryProvider({
  insert: async (record) => {
    inserted.push(record)
    return { id: '11111111-1111-4111-8111-111111111111' }
  },
})

const receipt = await provider.record({
  projectId: '  project-a  ',
  eventType: ' MODEL_INVOCATION ',
  operation: ' governance-summary ',
  status: 'SUCCESS',
  providerId: ' qwen ',
  modelName: ' qwen-test ',
  traceContext: {
    traceId: '4BF92F3577B34DA6A3CE929D0E0E4736',
    spanId: '00F067AA0BA902B7',
    parentSpanId: 'B7AD6B7169203331',
    traceFlags: '01',
    tracestate: 'vendor=opaque',
  },
  latencyMs: 125,
  inputTokens: 200,
  outputTokens: 50,
  costUsd: 0,
  attributes: {
    task: 'governance_summary',
    evidence_ids: ['finding-1', 'policy-2'],
    retrieval: { projection: true },
  },
  observedAt: '2026-09-08T14:45:00Z',
})

assert.deepEqual(receipt, { eventId: '11111111-1111-4111-8111-111111111111', persisted: true })
assert.equal(inserted.length, 1)
assert.equal(inserted[0].project_id, 'project-a')
assert.equal(inserted[0].event_type, 'MODEL_INVOCATION')
assert.equal(inserted[0].operation, 'governance-summary')
assert.equal(inserted[0].provider_id, 'qwen')
assert.equal(inserted[0].trace_id, '4bf92f3577b34da6a3ce929d0e0e4736')
assert.equal(inserted[0].span_id, '00f067aa0ba902b7')
assert.equal(inserted[0].parent_span_id, 'b7ad6b7169203331')
assert.equal(inserted[0].trace_flags, '01')
assert.equal(inserted[0].tracestate, 'vendor=opaque')
assert.equal(inserted[0].latency_ms, 125)
assert.equal(inserted[0].input_tokens, 200)
assert.equal(inserted[0].output_tokens, 50)
assert.equal(inserted[0].cost_usd, 0)
assert.equal(inserted[0].observed_at, '2026-09-08T14:45:00.000Z')

await assert.rejects(
  provider.record({ projectId: 'project-a', eventType: 'MODEL', operation: 'test', attributes: { prompt: 'secret' } }),
  /must not contain prompt, completion, or hidden reasoning payloads/,
)
await assert.rejects(
  provider.record({ projectId: 'project-a', eventType: 'MODEL', operation: 'test', attributes: { nested: { chain_of_thought: 'secret' } } }),
  /must not contain prompt, completion, or hidden reasoning payloads/,
)
await assert.rejects(
  provider.record({ projectId: 'project-a', eventType: 'MODEL', operation: 'test', traceContext: { traceId: '0'.repeat(32) } }),
  /traceContext.traceId must be a non-zero 32-character hexadecimal W3C trace id/,
)
await assert.rejects(
  provider.record({ projectId: 'project-a', eventType: 'MODEL', operation: 'test', traceContext: { traceId: '4bf92f3577b34da6a3ce929d0e0e4736', spanId: 'bad' } }),
  /traceContext.spanId must be a non-zero 16-character hexadecimal W3C span id/,
)
await assert.rejects(
  provider.record({ projectId: 'project-a', eventType: 'MODEL', operation: 'test', traceContext: { traceId: '4bf92f3577b34da6a3ce929d0e0e4736', tracestate: 'bad\nstate' } }),
  /traceContext.tracestate must be at most 512 characters and must not contain newlines/,
)
await assert.rejects(
  provider.record({ projectId: 'project-a', eventType: 'MODEL', operation: 'test', latencyMs: -1 }),
  /latencyMs must be a finite non-negative number/,
)
await assert.rejects(
  provider.record({ projectId: 'project-a', eventType: 'MODEL', operation: 'test', inputTokens: 1.5 }),
  /inputTokens must be an integer/,
)
await assert.rejects(
  provider.record({ projectId: ' ', eventType: 'MODEL', operation: 'test' }),
  /projectId is required/,
)

console.log('ADR-006 TelemetryProvider behavior verified.')
