import assert from 'node:assert/strict'
import {
  deriveJobEligibility,
  monitoringPresentationMode,
  workloadPoolForJobType,
} from '../lib/monitoring/domain-context-policy.ts'

const now = Date.parse('2026-09-14T05:30:00.000Z')
const queued = {
  status: 'QUEUED',
  attempts: 0,
  maxAttempts: 3,
  availableAt: '2026-09-14T05:29:00.000Z',
  leaseExpiresAt: null,
}

const expectedPersonaModes = new Map([
  ['SENIOR_LEADERSHIP', 'OUTCOME'],
  ['BUSINESS_USER', 'OUTCOME'],
  ['DATA_OWNER', 'OPERATIONS'],
  ['DATA_PRODUCT_OWNER', 'GOVERNANCE'],
  ['DATA_STEWARD', 'OPERATIONS'],
  ['DATA_GOVERNANCE_SPECIALIST', 'GOVERNANCE'],
  ['COMPLIANCE_RISK_OFFICER', 'GOVERNANCE'],
  ['PRIVACY_SECURITY_OFFICER', 'GOVERNANCE'],
  ['DATA_GOVERNANCE_ADMIN', 'OPERATIONS'],
  ['DATA_CUSTODIAN', 'OPERATIONS'],
  ['SOURCE_SYSTEM_OWNER', 'OPERATIONS'],
  ['METADATA_ANALYST', 'GOVERNANCE'],
  ['DATA_QUALITY_ANALYST', 'OPERATIONS'],
])
for (const [roleKey, expected] of expectedPersonaModes) {
  assert.equal(monitoringPresentationMode([roleKey]), expected, `${roleKey} must receive the intended information density`)
}
assert.equal(expectedPersonaModes.size, 13, 'all 13 governed application personas must be represented')
assert.equal(monitoringPresentationMode(['BUSINESS_USER'], 'ADMIN'), 'OPERATIONS')

assert.equal(workloadPoolForJobType('SEMANTIC_INDEX'), 'SEMANTIC')
assert.equal(workloadPoolForJobType('GOVERNANCE_AGENT'), 'GOVERNANCE')
assert.equal(workloadPoolForJobType('PROFILE'), 'CORE')

const eligible = deriveJobEligibility(queued, [], { runningCount: 1, maxConcurrentJobs: 4 }, now)
assert.equal(eligible.displayState, 'QUEUED')
assert.equal(eligible.eligible, true)

const dependencyBlocked = deriveJobEligibility(queued, [{
  dependencyType: 'SUCCESS',
  parentJobId: 'parent-1',
  parentJobType: 'PROFILE',
  parentStatus: 'RUNNING',
  satisfied: false,
}], { runningCount: 0, maxConcurrentJobs: 4 }, now)
assert.equal(dependencyBlocked.displayState, 'BLOCKED')
assert.equal(dependencyBlocked.eligible, false)
assert.match(dependencyBlocked.waitingReason ?? '', /Waiting for PROFILE to succeed/)

const dependencySatisfied = deriveJobEligibility(queued, [{
  dependencyType: 'SUCCESS',
  parentJobId: 'parent-1',
  parentJobType: 'PROFILE',
  parentStatus: 'SUCCEEDED',
  satisfied: true,
}], { runningCount: 0, maxConcurrentJobs: 4 }, now)
assert.equal(dependencySatisfied.displayState, 'QUEUED')
assert.equal(dependencySatisfied.eligible, true)

const backoff = deriveJobEligibility({ ...queued, availableAt: '2026-09-14T05:31:00.000Z' }, [], { runningCount: 0, maxConcurrentJobs: 4 }, now)
assert.equal(backoff.displayState, 'WAITING')
assert.match(backoff.waitingReason ?? '', /backoff/)

const capacity = deriveJobEligibility(queued, [], { runningCount: 4, maxConcurrentJobs: 4 }, now)
assert.equal(capacity.displayState, 'WAITING')
assert.match(capacity.waitingReason ?? '', /capacity is saturated/)

const attemptLimit = deriveJobEligibility({ ...queued, attempts: 3 }, [], { runningCount: 0, maxConcurrentJobs: 4 }, now)
assert.equal(attemptLimit.displayState, 'BLOCKED')
assert.match(attemptLimit.waitingReason ?? '', /Attempt limit reached/)

const healthyLease = deriveJobEligibility({ ...queued, status: 'RUNNING', leaseExpiresAt: '2026-09-14T05:31:00.000Z' }, [], { runningCount: 1, maxConcurrentJobs: 4 }, now)
assert.equal(healthyLease.leaseHealth, 'HEALTHY')
assert.equal(healthyLease.displayState, 'RUNNING')

const staleLease = deriveJobEligibility({ ...queued, status: 'RUNNING', leaseExpiresAt: '2026-09-14T05:29:00.000Z' }, [], { runningCount: 1, maxConcurrentJobs: 4 }, now)
assert.equal(staleLease.leaseHealth, 'STALE')

const missingLease = deriveJobEligibility({ ...queued, status: 'RUNNING', leaseExpiresAt: null }, [], { runningCount: 1, maxConcurrentJobs: 4 }, now)
assert.equal(missingLease.leaseHealth, 'MISSING')

console.log('Job Monitor domain context unit tests passed: all 13 persona density modes, pool isolation, dependency blocking, backoff, capacity, attempt limits, and lease integrity semantics.')
