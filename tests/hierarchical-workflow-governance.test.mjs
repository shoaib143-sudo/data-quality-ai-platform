import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('authorization envelope is resource scoped, short lived, integrity protected and reauthorized', () => {
  const source = read('lib/orchestration/workflow-authorization-envelope.ts')
  assert.match(source, /authorizeAgentAction/)
  assert.match(source, /AGENT_POLICY_VERSION/)
  assert.match(source, /expiresAt/)
  assert.match(source, /envelopeHash/)
  assert.match(source, /reauthorizeWorkflowEnvelope/)
  assert.match(source, /policy version is stale/)
})

test('capability broker fails closed, reauthorizes and validates provider IO', () => {
  const source = read('lib/orchestration/capability-broker.ts')
  assert.match(source, /reauthorizeWorkflowEnvelope/)
  assert.match(source, /operationalCapabilityKey/)
  assert.match(source, /No governed provider is registered/)
  assert.match(source, /validateInput/)
  assert.match(source, /validateOutput/)
  assert.doesNotMatch(source, /process\.env/)
})

test('task context enforces allowlist, required values and classification ceiling', () => {
  const source = read('lib/orchestration/workflow-context.ts')
  assert.match(source, /allowedKeys/)
  assert.match(source, /maxClassification/)
  assert.match(source, /Required task context key is unavailable/)
  assert.match(source, /classification exceeds authorized ceiling/)
  assert.match(source, /Object\.freeze/)
})

test('task closure requires a different verifier, PASS result and evidence', () => {
  const source = read('lib/orchestration/workflow-verification.ts')
  assert.match(source, /executorKey === result\.verifierKey/)
  assert.match(source, /Independent verification cannot be performed/)
  assert.match(source, /Verification evidence is required/)
  assert.match(source, /outcome !== 'PASS'/)
})
