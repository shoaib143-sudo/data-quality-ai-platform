import assert from 'node:assert/strict'
import { evaluateProfileReadinessRemediationPolicy } from '../lib/profiling/readiness-remediation-policy.ts'

function readiness(blockers, remediation, source_id = '00000000-0000-4000-8000-000000000001') {
  return { state: 'BLOCKED', profiling_ready: false, source_id, blockers, remediation }
}

const lowRiskObserved = {
  SOURCE_NOT_OBSERVED_READY: {
    ai_remediation: 'LOW_RISK_WHEN_POLICY_AUTHORIZED',
    approval_required: false,
  },
}

const lowRiskBinding = {
  EXECUTION_SOURCE_NOT_BOUND: {
    ai_remediation: 'LOW_RISK_WHEN_POLICY_AUTHORIZED',
    approval_required: false,
  },
}

let policy = evaluateProfileReadinessRemediationPolicy(readiness(
  { SOURCE_NOT_OBSERVED_READY: true },
  lowRiskObserved,
))
assert.equal(policy.canExecuteLowRiskRepair, true)
assert.deepEqual(policy.allowedActions, ['REVALIDATE_SOURCE', 'NO_ACTION'])
assert.equal(policy.approvalRequired, false)

policy = evaluateProfileReadinessRemediationPolicy(readiness(
  { EXECUTION_SOURCE_NOT_BOUND: true },
  lowRiskBinding,
))
assert.equal(policy.canExecuteLowRiskRepair, true)

policy = evaluateProfileReadinessRemediationPolicy(readiness(
  { SOURCE_NOT_OBSERVED_READY: true, SOURCE_NOT_ACTIVE: true },
  {
    ...lowRiskObserved,
    SOURCE_NOT_ACTIVE: { ai_remediation: 'POLICY_GATED', approval_required: true },
  },
))
assert.equal(policy.approvalRequired, true)
assert.equal(policy.canExecuteLowRiskRepair, false)
assert.deepEqual(policy.allowedActions, ['NO_ACTION'])

policy = evaluateProfileReadinessRemediationPolicy(readiness(
  { DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE: true },
  {
    DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE: {
      ai_remediation: 'LOW_RISK_WHEN_POLICY_AUTHORIZED',
      approval_required: false,
    },
  },
))
assert.equal(policy.allLowRisk, true)
assert.equal(policy.allAddressableBySourceRevalidation, false)
assert.equal(policy.canExecuteLowRiskRepair, false)
assert.deepEqual(policy.allowedActions, ['NO_ACTION'])

policy = evaluateProfileReadinessRemediationPolicy(readiness(
  { SOURCE_NOT_OBSERVED_READY: true },
  lowRiskObserved,
  '',
))
assert.equal(policy.canExecuteLowRiskRepair, false)

policy = evaluateProfileReadinessRemediationPolicy(readiness({}, {}))
assert.equal(policy.canExecuteLowRiskRepair, false)
assert.deepEqual(policy.allowedActions, ['NO_ACTION'])

policy = evaluateProfileReadinessRemediationPolicy(readiness(
  { SOURCE_NOT_OBSERVED_READY: true, EXECUTION_SOURCE_NOT_BOUND: true },
  { ...lowRiskObserved, ...lowRiskBinding },
))
assert.equal(policy.canExecuteLowRiskRepair, true)
assert.deepEqual(policy.blockerCodes.sort(), ['EXECUTION_SOURCE_NOT_BOUND', 'SOURCE_NOT_OBSERVED_READY'])

policy = evaluateProfileReadinessRemediationPolicy(readiness(
  { SOURCE_NOT_OBSERVED_READY: true, EXECUTION_SOURCE_NOT_BOUND: true },
  lowRiskObserved,
))
assert.equal(policy.allLowRisk, false)
assert.equal(policy.canExecuteLowRiskRepair, false)

console.log('Profile readiness AI remediation policy unit tests passed.')
