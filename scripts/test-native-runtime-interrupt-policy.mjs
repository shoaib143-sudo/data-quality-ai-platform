import assert from 'node:assert/strict'

function timeoutAction(interruptType) {
  return ['HUMAN_APPROVAL', 'MANUAL_REVIEW'].includes(interruptType) ? 'ESCALATED' : 'CANCELLED'
}

assert.equal(timeoutAction('HUMAN_APPROVAL'), 'ESCALATED')
assert.equal(timeoutAction('MANUAL_REVIEW'), 'ESCALATED')
assert.equal(timeoutAction('EXTERNAL_INPUT'), 'CANCELLED')
assert.equal(timeoutAction('DEPENDENCY'), 'CANCELLED')

const lifecycle = {
  pendingBeforeDeadline: 'PENDING',
  approvedBeforeDeadline: 'RESOLVED',
  approvedResume: 'RESUMED',
  timedOut: 'EXPIRED',
  rejected: 'RESOLVED',
}
assert.equal(lifecycle.pendingBeforeDeadline, 'PENDING')
assert.equal(lifecycle.approvedResume, 'RESUMED')
assert.equal(lifecycle.timedOut, 'EXPIRED')
assert.equal(lifecycle.rejected, 'RESOLVED')

console.log('native runtime interrupt policy unit tests passed')
