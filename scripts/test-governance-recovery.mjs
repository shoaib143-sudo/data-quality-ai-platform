import assert from 'node:assert/strict'
import test from 'node:test'

import { canMarkOriginalStepSucceeded, classifyGovernanceFailure, debuggerOutcomeRequiresOriginalStepRevalidation, failureSignalFromCode, validateDebuggerInput } from '../lib/orchestration/governance-recovery.ts'

test('security incidents always escalate without retry', () => {
  const result = classifyGovernanceFailure({ securityRelevant: true, retryable: true, attempt: 0, maxAttempts: 3 })
  assert.equal(result.disposition, 'SECURITY_ESCALATION')
  assert.equal(result.retryAllowed, false)
})

test('security-sensitive failure codes cannot be downgraded by generic denied matching', () => {
  for (const code of ['AUTHORIZATION_DENIED', 'CROSS_PROJECT_DENIED', 'TENANT_BOUNDARY_DENIED', 'SECURITY_POLICY_DENIED']) {
    const signal = failureSignalFromCode(code)
    assert.equal(signal.securityRelevant, true, code)
    assert.equal(signal.policyDenied, undefined, code)
    assert.equal(classifyGovernanceFailure(signal).disposition, 'SECURITY_ESCALATION', code)
  }
})

test('ordinary policy denials remain policy blocked', () => {
  const signal = failureSignalFromCode('POLICY_DENIED')
  assert.equal(signal.policyDenied, true)
  assert.equal(classifyGovernanceFailure(signal).disposition, 'BLOCKED_POLICY')
})

test('approval and runtime codes retain their governed routes', () => {
  assert.equal(classifyGovernanceFailure(failureSignalFromCode('APPROVAL_REQUIRED')).disposition, 'REQUIRES_APPROVAL')
  assert.equal(classifyGovernanceFailure(failureSignalFromCode('SUPERVISOR_LEASE_LOST')).disposition, 'DEBUGGER_REQUIRED')
  assert.equal(classifyGovernanceFailure(failureSignalFromCode('UNKNOWN_FAILURE')).disposition, 'FAIL_CLOSED')
})

test('policy denial blocks before retry logic', () => {
  const result = classifyGovernanceFailure({ policyDenied: true, retryable: true, attempt: 0, maxAttempts: 3 })
  assert.equal(result.disposition, 'BLOCKED_POLICY')
})

test('approval-required failure waits for approval', () => {
  const result = classifyGovernanceFailure({ approvalRequired: true })
  assert.equal(result.disposition, 'REQUIRES_APPROVAL')
})

test('runtime defect routes to governed debugger', () => {
  const result = classifyGovernanceFailure({ runtimeDefect: true })
  assert.equal(result.disposition, 'DEBUGGER_REQUIRED')
})

test('bounded transient retry is allowed only within budget', () => {
  assert.equal(classifyGovernanceFailure({ retryable: true, attempt: 1, maxAttempts: 3 }).disposition, 'RETRY_SAFE')
  assert.equal(classifyGovernanceFailure({ retryable: true, attempt: 3, maxAttempts: 3 }).disposition, 'FAIL_CLOSED')
})

test('ambiguous failures fail closed', () => {
  assert.equal(classifyGovernanceFailure({ ambiguous: true }).disposition, 'FAIL_CLOSED')
  assert.equal(classifyGovernanceFailure({}).disposition, 'FAIL_CLOSED')
})

test('debugger input requires bounded governed context', () => {
  const failures = validateDebuggerInput({
    failingRunId: '', failingStepId: '', correlationId: '', agentKey: '', sanitizedInput: {}, boundedLogs: [],
    previousAttempts: -1, dependencyStates: {}, policySnapshotId: '', evidenceRefs: [],
  })
  assert.ok(failures.length >= 6)
})

test('debugging success alone never marks original business step successful', () => {
  assert.equal(debuggerOutcomeRequiresOriginalStepRevalidation('RECOVERED_AND_REVALIDATED'), true)
  assert.equal(canMarkOriginalStepSucceeded({ debuggerOutcome: 'RECOVERED_AND_REVALIDATED', originalStepReexecuted: false, originalExitGatePassed: true }), false)
  assert.equal(canMarkOriginalStepSucceeded({ debuggerOutcome: 'RECOVERED_AND_REVALIDATED', originalStepReexecuted: true, originalExitGatePassed: false }), false)
  assert.equal(canMarkOriginalStepSucceeded({ debuggerOutcome: 'RECOVERED_AND_REVALIDATED', originalStepReexecuted: true, originalExitGatePassed: true }), true)
})
