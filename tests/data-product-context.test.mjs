import assert from 'node:assert/strict'
import test from 'node:test'
import { buildDataProductContext } from '../lib/governance/data-product-context.ts'

const complete = {
  hasBusinessDescription: true,
  hasOwner: true,
  hasApprovedMeaning: true,
  hasActiveContract: true,
  hasScoredProfile: true,
  hasLineage: true,
  hasAgentActivity: true,
}

test('consumer context is evidence based and does not grant product certification', () => {
  const signals = buildDataProductContext(complete)
  assert.equal(signals.length, 7)
  assert.ok(signals.every((signal) => signal.state === 'AVAILABLE'))
  assert.equal(signals.some((signal) => 'certified' in signal), false)
})

test('missing evidence remains a gap, while inaccessible evidence remains unknown', () => {
  const signals = buildDataProductContext({
    ...complete,
    hasApprovedMeaning: false,
    hasActiveContract: false,
    hasScoredProfile: false,
    hasLineage: null,
    hasAgentActivity: null,
  })
  const byKey = Object.fromEntries(signals.map((signal) => [signal.key, signal]))
  assert.equal(byKey.meaning.state, 'GAP')
  assert.equal(byKey.contract.state, 'GAP')
  assert.equal(byKey.quality.state, 'GAP')
  assert.equal(byKey.lineage.state, 'NOT_VISIBLE')
  assert.equal(byKey.lineage.href, null)
  assert.equal(byKey.agents.state, 'NOT_VISIBLE')
})
