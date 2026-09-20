import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseRetentionPolicyPatch,
  parseRetentionRunRequest,
  RetentionPolicyInputError,
} from '../lib/governance/retention-policy-input.ts'

test('retention patch preserves defaults and clamps supported numeric values', () => {
  assert.deepEqual(parseRetentionPolicyPatch({}), {
    profileHistoryDays: 365,
    agentJobHistoryDays: 180,
    minimumProfileRuns: 5,
    minimumAgentRuns: 50,
    enabled: false,
    legalHold: false,
  })

  assert.deepEqual(parseRetentionPolicyPatch({
    profileHistoryDays: '10',
    agentJobHistoryDays: 400.9,
    minimumProfileRuns: 999,
    minimumAgentRuns: 1,
    enabled: true,
    legalHold: true,
  }), {
    profileHistoryDays: 30,
    agentJobHistoryDays: 400,
    minimumProfileRuns: 100,
    minimumAgentRuns: 10,
    enabled: true,
    legalHold: true,
  })
})

test('retention patch rejects malformed bodies and non-finite numeric fields', () => {
  for (const body of [null, [], 'bad']) {
    assert.throws(() => parseRetentionPolicyPatch(body), RetentionPolicyInputError)
  }
  for (const value of ['abc', Number.NaN, Number.POSITIVE_INFINITY, null, {}]) {
    assert.throws(
      () => parseRetentionPolicyPatch({ profileHistoryDays: value }),
      /profileHistoryDays must be a finite number/,
    )
  }
})

test('retention execution requires an explicit confirmed RUN_NOW action', () => {
  assert.deepEqual(parseRetentionRunRequest({ action: 'RUN_NOW', confirm: true }), {
    action: 'RUN_NOW',
    confirm: true,
  })
  assert.throws(() => parseRetentionRunRequest(null), RetentionPolicyInputError)
  assert.throws(() => parseRetentionRunRequest({ action: 'RUN_NOW', confirm: false }), /action=RUN_NOW/)
})
