import assert from 'node:assert/strict'
import {
  NativePlanValidationError,
  certifyNativePinnedToolContract,
  executeNativeClosedLoop,
  getNativeDeterministicExecutionOrder,
  prepareNativeAutonomousExecution,
  validateNativeBoundedPlan,
} from '../lib/agents/runtime/native-autonomy-kernel.ts'

function certification(toolKey, overrides = {}) {
  return {
    toolKey,
    readOnly: false,
    idempotent: false,
    reversible: false,
    compensatable: false,
    destructive: false,
    privileged: false,
    governanceAuthorityChange: false,
    replayCertified: false,
    rollbackStrategy: 'NOT_APPLICABLE',
    ...overrides,
  }
}

const projectId = 'project-1'
const certifications = new Map([
  ['governance.dataset.read', certification('governance.dataset.read', { readOnly: true })],
  ['quality.rules.execute', certification('quality.rules.execute', {
    idempotent: true,
    compensatable: true,
    replayCertified: true,
    rollbackStrategy: 'COMPENSATION_TOOL',
    compensationToolKey: 'quality.rules.compensate',
  })],
  ['quality.remediation.propose', certification('quality.remediation.propose', {
    idempotent: true,
    replayCertified: true,
    rollbackStrategy: 'ESCALATE_ONLY',
  })],
])

const plan = {
  version: '1.0',
  goal: 'Investigate and safely evaluate data quality',
  projectId,
  steps: [
    {
      id: 'read-dataset',
      agentKey: 'steward_agent',
      toolKey: 'governance.dataset.read',
      projectId,
      input: { datasetId: 'dataset-1' },
    },
    {
      id: 'run-rules',
      agentKey: 'data_quality_agent',
      toolKey: 'quality.rules.execute',
      projectId,
      input: { datasetId: 'dataset-1' },
      dependsOn: ['read-dataset'],
    },
    {
      id: 'propose-remediation',
      agentKey: 'data_quality_agent',
      toolKey: 'quality.remediation.propose',
      projectId,
      input: { datasetId: 'dataset-1' },
      dependsOn: ['run-rules'],
    },
  ],
}

const validated = validateNativeBoundedPlan({ plan, certifications })
assert.deepEqual(validated.steps.map((step) => step.decision), [
  'AUTO_TIER_0',
  'AUTO_TIER_1',
  'APPROVAL_REQUIRED',
])
assert.deepEqual(validated.steps.map((step) => step.riskTier), [0, 1, 3])
assert.deepEqual(validated.steps.map((step) => step.retryCertified), [true, true, true])

const tier2 = validateNativeBoundedPlan({
  plan,
  certifications,
  policy: {
    allowTier2AutomaticExecution: true,
    approvedTier2Tools: ['quality.remediation.propose'],
  },
})
assert.equal(tier2.steps[2].decision, 'AUTO_TIER_2_PREAPPROVED')
assert.equal(tier2.steps[2].riskTier, 2)
assert.equal(tier2.steps[2].retryCertified, true)

const contractHash = `sha256:${'a'.repeat(64)}`
const pinnedRead = certifyNativePinnedToolContract({
  tool_key: 'governance.dataset.read',
  contract_hash: contractHash,
  execution_config: {
    executor: 'governance-read-executor',
    read_only: true,
    idempotent: true,
    replay_certified: true,
  },
})
assert.equal(pinnedRead.readOnly, true)
assert.equal(pinnedRead.executorKey, 'governance-read-executor')
assert.equal(pinnedRead.contractHash, contractHash)

const pinnedApproval = certifyNativePinnedToolContract({
  tool_key: 'quality.remediation.propose',
  contract_hash: contractHash,
  execution_config: {
    executor: 'quality-remediation-executor',
    approval_required: true,
    compensatable: true,
    rollback_strategy: 'COMPENSATION_TOOL',
    compensation_tool_key: 'quality.remediation.rollback',
  },
})
const approvalPlan = validateNativeBoundedPlan({
  plan: { ...plan, steps: [plan.steps[2]] },
  certifications: new Map([['quality.remediation.propose', pinnedApproval]]),
})
assert.equal(approvalPlan.steps[0].decision, 'APPROVAL_REQUIRED')
assert.equal(approvalPlan.steps[0].contractHash, contractHash)

assert.throws(
  () => certifyNativePinnedToolContract({
    tool_key: 'quality.rules.execute',
    contract_hash: contractHash,
    execution_config: {
      executor: 'quality-executor',
      replay_certified: true,
      idempotent: false,
      rollback_strategy: 'ESCALATE_ONLY',
    },
  }),
  /replay certification requires read-only or idempotent execution/,
)

assert.throws(
  () => certifyNativePinnedToolContract({
    tool_key: 'quality.rules.execute',
    contract_hash: contractHash,
    execution_config: {
      executor: 'quality-executor',
      idempotent: true,
      replay_certified: true,
    },
  }),
  /mutating tool requires rollback_strategy COMPENSATION_TOOL or ESCALATE_ONLY/,
)

assert.throws(
  () => certifyNativePinnedToolContract({
    tool_key: 'quality.rules.execute',
    contract_hash: contractHash,
    execution_config: {
      executor: 'quality-executor',
      idempotent: true,
      replay_certified: true,
      rollback_strategy: 'ESCALATE_ONLY',
      compensatable: true,
    },
  }),
  /ESCALATE_ONLY cannot claim reversible\/compensatable execution or a compensation tool/,
)

assert.throws(
  () => certifyNativePinnedToolContract({
    tool_key: 'quality.rules.execute',
    contract_hash: contractHash,
    execution_config: {
      executor: 'quality-executor',
      idempotent: true,
      replay_certified: true,
      rollback_strategy: 'COMPENSATION_TOOL',
      compensatable: true,
    },
  }),
  /COMPENSATION_TOOL requires compensation_tool_key/,
)

const pinnedCompensation = certifyNativePinnedToolContract({
  tool_key: 'quality.rules.execute',
  contract_hash: contractHash,
  execution_config: {
    executor: 'quality-executor',
    idempotent: true,
    replay_certified: true,
    rollback_strategy: 'COMPENSATION_TOOL',
    compensatable: true,
    compensation_tool_key: 'quality.rules.compensate',
  },
})
assert.equal(pinnedCompensation.rollbackStrategy, 'COMPENSATION_TOOL')
assert.equal(pinnedCompensation.compensationToolKey, 'quality.rules.compensate')

await assert.rejects(
  () => prepareNativeAutonomousExecution({
    goal: plan.goal,
    projectId,
    certifications,
    planner: async () => ({ ...plan, projectId: 'other-project' }),
  }),
  /planner changed the project scope/,
)

assert.throws(
  () => validateNativeBoundedPlan({
    plan: {
      ...plan,
      steps: [{
        ...plan.steps[0],
        toolKey: 'governance.policy.read',
      }],
    },
    certifications: new Map([
      ['governance.policy.read', certification('governance.policy.read', { readOnly: true })],
    ]),
  }),
  (error) => error instanceof NativePlanValidationError && /not allowed for steward_agent/.test(error.message),
)

assert.throws(
  () => validateNativeBoundedPlan({
    plan: {
      ...plan,
      steps: [
        { ...plan.steps[0], id: 'a', dependsOn: ['b'] },
        { ...plan.steps[1], id: 'b', dependsOn: ['a'] },
      ],
    },
    certifications,
  }),
  /dependency cycle detected/,
)

assert.throws(
  () => validateNativeBoundedPlan({
    plan: {
      ...plan,
      steps: [{ ...plan.steps[0], projectId: 'other-project' }],
    },
    certifications,
  }),
  /project scope does not match plan project/,
)

assert.throws(
  () => validateNativeBoundedPlan({
    plan: {
      ...plan,
      steps: [{ ...plan.steps[0], toolKey: 'governance.dataset.read' }],
    },
    certifications: new Map(),
  }),
  /has no safety certification/,
)

const outOfOrder = [
  { ...plan.steps[1], dependsOn: ['read-dataset'] },
  plan.steps[0],
]
assert.deepEqual(
  getNativeDeterministicExecutionOrder(outOfOrder).map((step) => step.id),
  ['read-dataset', 'run-rules'],
)

const retryPlan = validateNativeBoundedPlan({
  plan: { ...plan, steps: [plan.steps[0]] },
  certifications,
})
let executions = 0
const events = []
const retryResult = await executeNativeClosedLoop({
  plan: retryPlan,
  runtime: {
    async executeStep() {
      executions += 1
      return { attempt: executions }
    },
    async validateOutcome({ attempt }) {
      return { valid: attempt === 2, code: attempt === 2 ? 'RESTORED' : 'NOT_READY' }
    },
    async recover() {
      return 'RETRY'
    },
    async onEvent(event) {
      events.push(event.type)
    },
  },
})
assert.equal(retryResult.status, 'SUCCEEDED')
assert.equal(executions, 2)
assert.ok(events.includes('RECOVERY_DECIDED'))
assert.ok(events.includes('PLAN_SUCCEEDED'))

const boundedTier2Plan = validateNativeBoundedPlan({
  plan: { ...plan, steps: [plan.steps[2]] },
  certifications,
  policy: {
    allowTier2AutomaticExecution: true,
    approvedTier2Tools: ['quality.remediation.propose'],
  },
})
let boundedAttempts = 0
const boundedFailure = await executeNativeClosedLoop({
  plan: boundedTier2Plan,
  runtime: {
    async executeStep() {
      boundedAttempts += 1
      throw Object.assign(new Error('temporary failure'), { code: 'STEP_FAILED' })
    },
    async validateOutcome() {
      return { valid: false }
    },
    async recover() {
      return 'RETRY'
    },
  },
})
assert.equal(boundedAttempts, 3)
assert.deepEqual(boundedFailure, {
  status: 'FAILED',
  completedStepIds: [],
  stepId: 'propose-remediation',
  code: 'STEP_FAILED',
})

const approvalResult = await executeNativeClosedLoop({
  plan: approvalPlan,
  runtime: {
    async executeStep() {
      throw new Error('approval step must not execute before approval')
    },
    async validateOutcome() {
      return { valid: true }
    },
    async requestApproval() {
      return 'interrupt-1'
    },
  },
})
assert.deepEqual(approvalResult, {
  status: 'WAITING_APPROVAL',
  completedStepIds: [],
  stepId: 'propose-remediation',
  interruptId: 'interrupt-1',
})

console.log('Native DataNexus autonomy kernel, pinned safety policy, and closed-loop recovery verified.')
