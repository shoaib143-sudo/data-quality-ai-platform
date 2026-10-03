import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('authorization envelope is resource scoped, short lived and policy pinned', () => {
  const source = read('lib/orchestration/workflow-authorization-envelope.ts')
  assert.match(source, /authorizeAgentAction/)
  assert.match(source, /AGENT_POLICY_VERSION/)
  assert.match(source, /expiresAt/)
  assert.match(source, /policy version is stale/)
})

test('capability broker fails closed and cannot bypass envelope capability', () => {
  const source = read('lib/orchestration/capability-broker.ts')
  assert.match(source, /assertWorkflowAuthorizationEnvelopeCurrent/)
  assert.match(source, /Capability request does not match the authorized envelope/)
  assert.match(source, /No governed provider is registered/)
  assert.doesNotMatch(source, /process\.env/)
})

test('task context is explicit allowlist inheritance rather than implicit workflow history', () => {
  const source = read('lib/orchestration/workflow-context.ts')
  assert.match(source, /allowedKeys/)
  assert.match(source, /maxEntries/)
  assert.match(source, /Object\.freeze/)
})

test('task closure requires independent PASS verification with evidence', () => {
  const source = read('lib/orchestration/workflow-verification.ts')
  assert.match(source, /verifier identity is required/)
  assert.match(source, /Verification evidence is required/)
  assert.match(source, /outcome !== 'PASS'/)
})
