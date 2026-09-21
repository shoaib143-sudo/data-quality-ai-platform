import assert from 'node:assert/strict'
import fs from 'node:fs'
import { resolveProfilingRunHandoff } from '../lib/profiling/profiling-run-handoff.ts'

assert.deepEqual(
  resolveProfilingRunHandoff({ agentRunId: 'run 1', monitorUrl: '/monitoring?run=run%201', reused: false }),
  { agentRunId: 'run 1', monitorUrl: '/monitoring?run=run%201', reused: false },
)
assert.equal(resolveProfilingRunHandoff({ agentRunId: 'abc', reused: true }).monitorUrl, '/monitoring?run=abc')
assert.equal(resolveProfilingRunHandoff({ agentRunId: 'abc', monitorUrl: 'https://evil.example/run' }).monitorUrl, '/monitoring?run=abc')
assert.equal(resolveProfilingRunHandoff({ agentRunId: 'abc', monitorUrl: '//evil.example' }).monitorUrl, '/monitoring?run=abc')
assert.throws(() => resolveProfilingRunHandoff({ monitorUrl: '/monitoring?run=missing' }), /agent run identifier/)

const registration = fs.readFileSync('app/datasets/register-dataset-form.tsx', 'utf8')
const actions = fs.readFileSync('app/datasets/dataset-actions.tsx', 'utf8')
for (const source of [registration, actions]) {
  assert.ok(source.includes("'Idempotency-Key': idempotencyKey"), 'profiling CTA must submit an idempotency key')
  assert.ok(source.includes('resolveProfilingRunHandoff(payload)'), 'profiling CTA must validate the accepted-run handoff')
}
assert.ok(registration.includes('Execution is queued through the governed durable worker and continues in Job Monitor.'), 'registration must explain asynchronous execution')
assert.ok(registration.includes('Queueing…'), 'registration run CTA must expose busy state')
assert.ok(actions.includes('Checking readiness…'), 'Dataset 360 actions must expose readiness loading state')
console.log('Golden Path profiling handoff unit and UX tests passed.')
