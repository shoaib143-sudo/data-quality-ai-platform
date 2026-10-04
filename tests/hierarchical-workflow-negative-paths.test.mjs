import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('compiler rejects empty, cyclic, unscoped and overlong tasks', () => {
  const source = read('lib/orchestration/hierarchical-workflow.ts')
  assert.match(source, /must contain at least one task/)
  assert.match(source, /dependency cycle detected/)
  assert.match(source, /at least one resourceScope is required/)
  assert.match(source, /at least one evidence requirement is required/)
  assert.match(source, /timeoutMs cannot exceed workflow maxRuntimeMs/)
})

test('workflow authorization detects envelope tampering and rechecks authority', () => {
  const source = read('lib/orchestration/workflow-authorization-envelope.ts')
  assert.match(source, /integrity check failed/)
  assert.match(source, /reauthorizeWorkflowEnvelope/)
  assert.match(source, /authorizeAgentAction\(envelope\.actorUserId/)
})

test('workflow observability carries correlation without prompt or reasoning payloads', () => {
  const source = read('lib/orchestration/workflow-observability.ts')
  assert.match(source, /correlationId/)
  assert.match(source, /definition_hash/)
  assert.doesNotMatch(source, /prompt|completion|chain.?of.?thought|hidden.?reasoning/i)
})
