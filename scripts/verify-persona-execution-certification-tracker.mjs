import assert from 'node:assert/strict'
import fs from 'node:fs'

const tracker = JSON.parse(fs.readFileSync('docs/testing/persona-execution-certification-tracker.json', 'utf8'))
const allowed = new Set(tracker.statuses)
assert.equal(tracker.schemaVersion, 1)
assert.ok(tracker.personas['data-steward'], 'Data Steward certification state must be persisted.')

const requiredDimensions = [
  'contractUnit',
  'functional',
  'negativeFailure',
  'independentAdversarial',
  'uiUx',
  'accessibility',
  'rbacAuthorization',
  'executionModes',
  'concurrencyIdempotency',
  'e2eLifecycle',
  'literalAuthenticatedBrowser',
  'selfHealingHandsfree',
  'finalCertification',
]

for (const [persona, state] of Object.entries(tracker.personas)) {
  for (const dimension of requiredDimensions) {
    assert.ok(dimension in state, `${persona} missing certification dimension ${dimension}`)
    assert.ok(allowed.has(state[dimension]), `${persona}/${dimension} uses invalid status ${state[dimension]}`)
  }

  if (state.finalCertification === 'PASS') {
    for (const dimension of requiredDimensions.filter(item => !['finalCertification'].includes(item))) {
      assert.equal(state[dimension], 'PASS', `${persona} cannot be finally certified while ${dimension} is ${state[dimension]}`)
    }
    assert.deepEqual(state.blockers ?? [], [], `${persona} cannot be finally certified with active blockers`)
  }
}

const steward = tracker.personas['data-steward']
assert.equal(steward.finalCertification, 'IN_PROGRESS', 'Data Steward must not be over-certified before authenticated browser and self-healing evidence exist.')
assert.equal(steward.literalAuthenticatedBrowser, 'BLOCKED')
assert.equal(steward.selfHealingHandsfree, 'BLOCKED')
assert.ok(steward.blockers.length >= 2)

console.log('Persona certification tracker integrity: PASS')
