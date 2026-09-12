import assert from 'node:assert/strict'
import {
  assertDataQualityVerificationBinding,
  DataQualityVerificationBindingError,
} from '../lib/data-quality/remediation-verification-integrity.ts'

const current = {
  workflowInstanceId: 'workflow-1',
  verificationAgentRunId: 'agent-verify-1',
  verificationProfileRunId: 'profile-verify-1',
  verificationGeneration: 2,
}

assert.doesNotThrow(() => assertDataQualityVerificationBinding(current, {
  agentRunId: 'agent-verify-1',
  input: {
    workflowInstanceId: 'workflow-1',
    verificationGeneration: 2,
    profileRunId: 'profile-verify-1',
    trigger: 'DATA_QUALITY_REMEDIATION_VERIFICATION',
  },
}))

for (const [label, candidate, code] of [
  ['agent', { agentRunId: 'wrong-agent', input: {} }, 'DQ_VERIFICATION_AGENT_MISMATCH'],
  ['workflow', { agentRunId: 'agent-verify-1', input: { workflowInstanceId: 'other', verificationGeneration: 2, profileRunId: 'profile-verify-1', trigger: 'DATA_QUALITY_REMEDIATION_VERIFICATION' } }, 'DQ_VERIFICATION_WORKFLOW_MISMATCH'],
  ['generation', { agentRunId: 'agent-verify-1', input: { workflowInstanceId: 'workflow-1', verificationGeneration: 1, profileRunId: 'profile-verify-1', trigger: 'DATA_QUALITY_REMEDIATION_VERIFICATION' } }, 'DQ_VERIFICATION_GENERATION_MISMATCH'],
  ['trigger', { agentRunId: 'agent-verify-1', input: { workflowInstanceId: 'workflow-1', verificationGeneration: 2, profileRunId: 'profile-verify-1', trigger: 'PROFILE_COMPLETED' } }, 'DQ_VERIFICATION_TRIGGER_MISMATCH'],
  ['profile', { agentRunId: 'agent-verify-1', input: { workflowInstanceId: 'workflow-1', verificationGeneration: 2, profileRunId: 'other-profile', trigger: 'DATA_QUALITY_REMEDIATION_VERIFICATION' } }, 'DQ_VERIFICATION_PROFILE_MISMATCH'],
]) {
  assert.throws(
    () => assertDataQualityVerificationBinding(current, candidate),
    (error) => error instanceof DataQualityVerificationBindingError && error.code === code,
    `${label} mismatch must fail closed`,
  )
}

assert.throws(
  () => assertDataQualityVerificationBinding({ ...current, verificationAgentRunId: null }, { agentRunId: 'anything', input: {} }),
  (error) => error instanceof DataQualityVerificationBindingError && error.code === 'DQ_VERIFICATION_AGENT_NOT_LINKED',
)

// Historical generation-0 outcomes did not persist workflow/generation metadata
// into agent input. Exact authoritative agent + profile identity remains enough
// to preserve valid legacy evidence while rejecting stale substitutions.
const legacy = {
  workflowInstanceId: 'legacy-workflow',
  verificationAgentRunId: 'legacy-agent',
  verificationProfileRunId: 'legacy-profile',
  verificationGeneration: 0,
}
assert.doesNotThrow(() => assertDataQualityVerificationBinding(legacy, {
  agentRunId: 'legacy-agent',
  input: { trigger: 'PROFILE_COMPLETED', profileRunId: 'legacy-profile' },
}))
assert.throws(
  () => assertDataQualityVerificationBinding(legacy, { agentRunId: 'stale-agent', input: { profileRunId: 'legacy-profile' } }),
  (error) => error instanceof DataQualityVerificationBindingError && error.code === 'DQ_VERIFICATION_AGENT_MISMATCH',
)
assert.throws(
  () => assertDataQualityVerificationBinding(legacy, { agentRunId: 'legacy-agent', input: { profileRunId: 'stale-profile' } }),
  (error) => error instanceof DataQualityVerificationBindingError && error.code === 'DQ_VERIFICATION_PROFILE_MISMATCH',
)

console.log('Data Quality verification evidence-binding unit tests passed.')
