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
