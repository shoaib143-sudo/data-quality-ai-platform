import assert from 'node:assert/strict'
import test from 'node:test'
import { evaluateAutonomyPolicy, validateAutonomyPolicy, validateBlastRadius } from '../lib/orchestration/autonomy-policy.ts'

const policy = (overrides = {}) => ({
  mode: 'FULL_AUTONOMOUS',
  enabled: true,
  policyVersion: 'v1',
  maximumRiskTier: 'MEDIUM',
  allowedAgentKeys: ['profiling_agent'],
  allowedToolKeys: ['profile.execute'],
  allowedModelClasses: ['governed_reasoning'],
  allowedMutationClasses: ['LOW_RISK_REMEDIATION'],
  approvalRequiredActions: ['DELETE_DATASET'],
  autoRemediationEnabled: true,
  autoRollbackEnabled: true,
  maxExecutionBudget: 100,
  maxModelBudget: 25,
  maxRuntimeMs: 300_000,
  maxDatasetsChangedPerRun: 5,
  maxProjectsAffectedPerRun: 1,
  maxRemediationActionsPerHour: 10,
  maxConcurrentModelCalls: 4,
  emergencyStop: false,
  ...overrides,
})

const input = (overrides = {}) => ({
  riskTier: 'LOW',
  actionKey: 'RUN_PROFILING',
  agentKey: 'profiling_agent',
  toolKey: 'profile.execute',
  modelClass: 'governed_reasoning',
  mutationClass: 'LOW_RISK_REMEDIATION',
  estimatedExecutionCost: 10,
  estimatedModelCost: 3,
  ...overrides,
})

test('permits in-envelope autonomous execution without approval', () => {
  assert.deepEqual(evaluateAutonomyPolicy(policy(), input()), {
    allowed: true,
    requiresApproval: false,
    reason: 'Action is permitted by the active autonomy policy.',
  })
})

test('fails closed on emergency stop, excessive risk, budgets, and non-allowlisted executors', () => {
  assert.equal(evaluateAutonomyPolicy(policy({ emergencyStop: true }), input()).allowed, false)
  assert.equal(evaluateAutonomyPolicy(policy(), input({ riskTier: 'HIGH' })).allowed, false)
  assert.equal(evaluateAutonomyPolicy(policy(), input({ estimatedModelCost: 26 })).allowed, false)
  assert.equal(evaluateAutonomyPolicy(policy(), input({ toolKey: 'dangerous.tool' })).allowed, false)
})

test('rejects invalid policy configuration and malformed cost estimates', () => {
  assert.ok(validateAutonomyPolicy(policy({ policyVersion: '', maxConcurrentModelCalls: 0 })).length >= 2)
  assert.equal(evaluateAutonomyPolicy(policy({ maxExecutionBudget: -1 }), input()).allowed, false)
  assert.equal(evaluateAutonomyPolicy(policy(), input({ estimatedExecutionCost: -1 })).allowed, false)
  assert.equal(evaluateAutonomyPolicy(policy(), input({ estimatedModelCost: Number.NaN })).allowed, false)
})

test('guided mode and explicit actions require approval rather than bypassing policy', () => {
  assert.equal(evaluateAutonomyPolicy(policy({ mode: 'GUIDED' }), input()).requiresApproval, true)
  assert.equal(evaluateAutonomyPolicy(policy(), input({ actionKey: 'DELETE_DATASET' })).requiresApproval, true)
})

test('rejects blast-radius overruns and malformed observations', () => {
  assert.deepEqual(validateBlastRadius(policy(), { datasetsChanged: 6, projectsAffected: 2, remediationActionsThisHour: 11 }), [
    'Dataset blast-radius limit exceeded.',
    'Project blast-radius limit exceeded.',
    'Remediation rate limit exceeded.',
  ])
  assert.ok(validateBlastRadius(policy(), { datasetsChanged: -1, projectsAffected: 0, remediationActionsThisHour: 0 }).some(error => error.includes('observation')))
})
