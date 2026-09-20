import assert from 'node:assert/strict'
import test from 'node:test'

import {
  assertDataQualityVerificationBinding,
  DataQualityVerificationBindingError,
} from '../lib/data-quality/remediation-verification-integrity.ts'

function expectCode(fn, code) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof DataQualityVerificationBindingError)
    assert.equal(error.code, code)
    return true
  })
}

const current = {
  workflowInstanceId: 'workflow-1',
  verificationAgentRunId: 'agent-run-1',
  verificationProfileRunId: 'profile-run-1',
  verificationGeneration: 2,
}

test('current-generation verification requires exact workflow, generation, trigger, agent and profile bindings', () => {
  assert.doesNotThrow(() => assertDataQualityVerificationBinding(current, {
    agentRunId: 'agent-run-1',
    input: {
      profileRunId: 'profile-run-1',
      workflowInstanceId: 'workflow-1',
      verificationGeneration: 2,
      trigger: 'DATA_QUALITY_REMEDIATION_VERIFICATION',
    },
  }))

  expectCode(() => assertDataQualityVerificationBinding({ ...current, verificationAgentRunId: null }, {
    agentRunId: 'agent-run-1',
    input: {},
  }), 'DQ_VERIFICATION_AGENT_NOT_LINKED')

  expectCode(() => assertDataQualityVerificationBinding(current, {
    agentRunId: 'other-agent',
    input: {},
  }), 'DQ_VERIFICATION_AGENT_MISMATCH')

  expectCode(() => assertDataQualityVerificationBinding(current, {
    agentRunId: 'agent-run-1',
    input: { profileRunId: 'wrong' },
  }), 'DQ_VERIFICATION_PROFILE_MISMATCH')

  expectCode(() => assertDataQualityVerificationBinding(current, {
    agentRunId: 'agent-run-1',
    input: {
      profileRunId: 'profile-run-1',
      workflowInstanceId: 'wrong',
      verificationGeneration: 2,
      trigger: 'DATA_QUALITY_REMEDIATION_VERIFICATION',
    },
  }), 'DQ_VERIFICATION_WORKFLOW_MISMATCH')

  expectCode(() => assertDataQualityVerificationBinding(current, {
    agentRunId: 'agent-run-1',
    input: {
      profileRunId: 'profile-run-1',
      workflowInstanceId: 'workflow-1',
      verificationGeneration: '3',
      trigger: 'DATA_QUALITY_REMEDIATION_VERIFICATION',
    },
  }), 'DQ_VERIFICATION_GENERATION_MISMATCH')

  expectCode(() => assertDataQualityVerificationBinding(current, {
    agentRunId: 'agent-run-1',
    input: {
      profileRunId: 'profile-run-1',
      workflowInstanceId: 'workflow-1',
      verificationGeneration: 2,
      trigger: 'MANUAL_API',
    },
  }), 'DQ_VERIFICATION_TRIGGER_MISMATCH')
})

test('legacy generation zero remains bound to persisted agent/profile identity without inventing new metadata', () => {
  assert.doesNotThrow(() => assertDataQualityVerificationBinding({
    workflowInstanceId: 'legacy-workflow',
    verificationAgentRunId: 'legacy-agent',
    verificationProfileRunId: 'legacy-profile',
    verificationGeneration: 0,
  }, {
    agentRunId: 'legacy-agent',
    input: { profileRunId: 'legacy-profile' },
  }))
})
