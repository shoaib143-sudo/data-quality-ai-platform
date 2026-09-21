import assert from 'node:assert/strict'
import { classifyRemediationSla } from '../lib/governance/remediation-sla.ts'

const now = Date.parse('2026-09-21T04:00:00Z')

assert.equal(classifyRemediationSla({ status: 'OPEN', dueAt: null, nowMs: now }), 'NOT_SET')
assert.equal(classifyRemediationSla({ status: 'OPEN', dueAt: '2026-09-22T04:00:00Z', nowMs: now }), 'DUE')
assert.equal(classifyRemediationSla({ status: 'IN_PROGRESS', dueAt: '2026-09-20T04:00:00Z', nowMs: now }), 'OVERDUE')
assert.equal(classifyRemediationSla({ status: 'OPEN', dueAt: 'not-a-date', nowMs: now }), 'INVALID')
assert.equal(classifyRemediationSla({ status: 'RESOLVED', dueAt: '2026-09-20T04:00:00Z', nowMs: now }), 'RESOLVED')
assert.equal(classifyRemediationSla({ status: 'CLOSED', dueAt: null, nowMs: now }), 'RESOLVED')
assert.equal(classifyRemediationSla({ status: 'CANCELLED', dueAt: 'not-a-date', nowMs: now }), 'RESOLVED')
assert.equal(classifyRemediationSla({ status: 'REJECTED', dueAt: '2026-09-20T04:00:00Z', nowMs: now }), 'RESOLVED')

console.log('Remediation SLA unit and negative tests passed.')
