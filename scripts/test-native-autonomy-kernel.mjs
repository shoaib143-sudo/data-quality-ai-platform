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
    ...overrides,
  }
}

const projectId = 'project-1'
const certifications = new Map([
  ['governance.dataset.read', certification('governance.dataset.read', { readOnly: true })],
  ['quality.rules.execute', certification('quality.rules.execute', { idempotent: true, reversible: true, replayCertified: true })],
  ['quality.remediation.propose', certification('quality.remediation.propose', { reversible: true })],
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
assert.deepEqual(validated.steps.map((step) => step.retryCertified), [true, true, false])

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
assert.equal(tier2.steps[2].retryCertified, false)

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
    reversible: true,
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
    },
  }),
  /replay certification requires read-only or idempotent execution/,
)

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

const unsafeTier2Plan = validateNativeBoundedPlan({
  plan: { ...plan, steps: [plan.steps[2]] },
  certifications,
  policy: {
    allowTier2AutomaticExecution: true,
    approvedTier2Tools: ['quality.remediation.propose'],
  },
})
const unsafeRetry = await executeNativeClosedLoop({
  plan: unsafeTier2Plan,
  runtime: {
    async executeStep() {
      throw new Error('temporary failure')
    },
    async validateOutcome() {
      return { valid: false }
    },
    async recover() {
      return 'RETRY'
    },
  },
})
assert.deepEqual(unsafeRetry, {
  status: 'FAILED',
  completedStepIds: [],
  stepId: 'propose-remediation',
  code: 'UNSAFE_RETRY_BLOCKED',
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
