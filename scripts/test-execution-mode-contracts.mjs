import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateAutonomyPolicy } from '../lib/orchestration/governance-orchestrator.ts'

const basePolicy = {
  mode: 'GOVERNED_AUTO',
  enabled: true,
  policyVersion: 'execution-mode-test-v1',
  maximumRiskTier: 'MEDIUM',
  allowedAgentKeys: ['governance_orchestrator_agent'],
  allowedToolKeys: ['read', 'profile'],
  allowedModelClasses: ['approved'],
  allowedMutationClasses: ['SAFE_REVERSIBLE'],
  approvalRequiredActions: ['DESTRUCTIVE_ACTION'],
  autoRemediationEnabled: true,
  autoRollbackEnabled: true,
  maxExecutionBudget: 10,
  maxModelBudget: 5,
  maxRuntimeMs: 300000,
  maxDatasetsChangedPerRun: 1,
  maxProjectsAffectedPerRun: 1,
  maxRemediationActionsPerHour: 2,
  maxConcurrentModelCalls: 2,
  emergencyStop: false,
}

test('manual/OFF mode never authorizes autonomous execution', () => {
  const decision = evaluateAutonomyPolicy(
    { ...basePolicy, mode: 'OFF', enabled: false },
    { riskTier: 'LOW', actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR' },
  )
  assert.equal(decision.allowed, false)
  assert.equal(decision.requiresApproval, false)
})

test('assisted/GUIDED mode permits eligible work only behind approval', () => {
  const decision = evaluateAutonomyPolicy(
    { ...basePolicy, mode: 'GUIDED' },
    { riskTier: 'LOW', actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR', agentKey: 'governance_orchestrator_agent' },
  )
  assert.equal(decision.allowed, true)
  assert.equal(decision.requiresApproval, true)
})

test('automated/GOVERNED_AUTO permits low-risk allowlisted execution without routine approval', () => {
  const decision = evaluateAutonomyPolicy(
    basePolicy,
    { riskTier: 'LOW', actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR', agentKey: 'governance_orchestrator_agent' },
  )
  assert.equal(decision.allowed, true)
  assert.equal(decision.requiresApproval, false)
})

test('goal-driven/FULL_AUTONOMOUS remains policy bounded', () => {
  const policy = { ...basePolicy, mode: 'FULL_AUTONOMOUS' }
  assert.deepEqual(
    evaluateAutonomyPolicy(policy, {
      riskTier: 'LOW',
      actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR',
      agentKey: 'governance_orchestrator_agent',
    }),
    { allowed: true, requiresApproval: false, reason: 'Action is permitted by active autonomy policy.' },
  )

  const denied = evaluateAutonomyPolicy(policy, {
    riskTier: 'LOW',
    actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR',
    agentKey: 'unregistered_agent',
  })
  assert.equal(denied.allowed, false)
})

test('human-in-the-loop action gates remain mandatory in every autonomous mode', () => {
  for (const mode of ['GOVERNED_AUTO', 'FULL_AUTONOMOUS']) {
    const decision = evaluateAutonomyPolicy(
      { ...basePolicy, mode },
      { riskTier: 'LOW', actionKey: 'DESTRUCTIVE_ACTION' },
    )
    assert.equal(decision.allowed, true)
    assert.equal(decision.requiresApproval, true)
  }
})

test('human-on-the-loop emergency stop overrides every enabled mode', () => {
  for (const mode of ['GUIDED', 'GOVERNED_AUTO', 'FULL_AUTONOMOUS']) {
    const decision = evaluateAutonomyPolicy(
      { ...basePolicy, mode, emergencyStop: true },
      { riskTier: 'LOW', actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR' },
    )
    assert.equal(decision.allowed, false)
    assert.match(decision.reason, /Emergency stop/)
  }
})

test('straight-through execution still fails closed on risk, budget, tool and mutation boundaries', () => {
  const inputs = [
    { riskTier: 'CRITICAL', actionKey: 'RUN' },
    { riskTier: 'LOW', actionKey: 'RUN', estimatedExecutionCost: 11 },
    { riskTier: 'LOW', actionKey: 'RUN', toolKey: 'shell-root' },
    { riskTier: 'LOW', actionKey: 'RUN', mutationClass: 'IRREVERSIBLE_PRODUCTION_DELETE' },
  ]
  for (const input of inputs) {
    assert.equal(evaluateAutonomyPolicy(basePolicy, input).allowed, false)
  }
})
