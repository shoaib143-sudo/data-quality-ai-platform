import assert from 'node:assert/strict'
import test from 'node:test'
import {
  evaluateAutonomyPolicy,
  mandatoryAiGovernanceCapabilities,
  summarizeCapabilityCoverage,
  validateBlastRadius,
  validateCapabilityPlan,
} from '../lib/orchestration/governance-orchestrator.ts'

const policy = {
  mode: 'FULL_AUTONOMOUS',
  enabled: true,
  policyVersion: 'test-v1',
  maximumRiskTier: 'LOW',
  allowedAgentKeys: ['governance_orchestrator_agent'],
  allowedToolKeys: ['read'],
  allowedModelClasses: ['approved'],
  allowedMutationClasses: [],
  approvalRequiredActions: ['HIGH_RISK_ACTION'],
  autoRemediationEnabled: false,
  autoRollbackEnabled: true,
  maxExecutionBudget: 10,
  maxModelBudget: 5,
  maxRuntimeMs: 300000,
  maxDatasetsChangedPerRun: 1,
  maxProjectsAffectedPerRun: 1,
  maxRemediationActionsPerHour: 0,
  maxConcurrentModelCalls: 2,
  emergencyStop: false,
}

test('mandatory AI capability inventory is unique and complete enough to fail closed', () => {
  assert.equal(mandatoryAiGovernanceCapabilities.length, 19)
  assert.equal(new Set(mandatoryAiGovernanceCapabilities.map(row => row.capabilityKey)).size, 19)
  assert.ok(mandatoryAiGovernanceCapabilities.every(row => row.mandatoryForE2E && row.evidenceContract.length > 0))
})

test('OFF and emergency stop deny execution', () => {
  assert.equal(evaluateAutonomyPolicy({ ...policy, mode: 'OFF', enabled: false }, { riskTier: 'LOW', actionKey: 'RUN' }).allowed, false)
  assert.equal(evaluateAutonomyPolicy({ ...policy, emergencyStop: true }, { riskTier: 'LOW', actionKey: 'RUN' }).allowed, false)
})

test('policy rejects excess risk, cost and non allowlisted executors', () => {
  assert.equal(evaluateAutonomyPolicy(policy, { riskTier: 'HIGH', actionKey: 'RUN' }).allowed, false)
  assert.equal(evaluateAutonomyPolicy(policy, { riskTier: 'LOW', actionKey: 'RUN', estimatedExecutionCost: 11 }).allowed, false)
  assert.equal(evaluateAutonomyPolicy(policy, { riskTier: 'LOW', actionKey: 'RUN', agentKey: 'rogue_agent' }).allowed, false)
})

test('guided and explicit actions require approval without bypass', () => {
  assert.equal(evaluateAutonomyPolicy({ ...policy, mode: 'GUIDED' }, { riskTier: 'LOW', actionKey: 'RUN' }).requiresApproval, true)
  assert.equal(evaluateAutonomyPolicy(policy, { riskTier: 'LOW', actionKey: 'HIGH_RISK_ACTION' }).requiresApproval, true)
})

test('blast radius limits fail closed', () => {
  assert.deepEqual(validateBlastRadius(policy, { datasetsChanged: 2, projectsAffected: 2, remediationActionsThisHour: 1 }), [
    'Dataset blast-radius limit exceeded.',
    'Project blast-radius limit exceeded.',
    'Remediation rate limit exceeded.',
  ])
})

test('plan validation rejects unknown dependencies and cycles', () => {
  const base = {
    domain: 'GOVERNANCE', version: '1.0', mandatoryForE2E: true, executorType: 'AGENT', executorKey: 'x',
    requiredCapability: 'agent.execute', riskTier: 'LOW', evidenceContract: ['evidence'], certificationGate: 'gate', enabled: true,
  }
  const unknown = validateCapabilityPlan([{ ...base, capabilityKey: 'a', dependencies: ['missing'] }])
  assert.ok(unknown.some(message => message.includes('unknown dependency')))
  const cycle = validateCapabilityPlan([
    { ...base, capabilityKey: 'a', dependencies: ['b'] },
    { ...base, capabilityKey: 'b', dependencies: ['a'] },
  ])
  assert.ok(cycle.some(message => message.includes('cycle')))
})

test('coverage cannot certify missing, blocked, failed, not measured or duplicate results', () => {
  const descriptors = mandatoryAiGovernanceCapabilities.slice(0, 2)
  assert.equal(summarizeCapabilityCoverage(descriptors, []).certificationEligible, false)
  assert.equal(summarizeCapabilityCoverage(descriptors, [
    { capabilityKey: descriptors[0].capabilityKey, outcome: 'EXECUTED_AND_PASSED', evidenceRefs: ['x'], reason: null },
    { capabilityKey: descriptors[1].capabilityKey, outcome: 'NOT_MEASURED', evidenceRefs: [], reason: 'no evidence' },
  ]).certificationEligible, false)
  assert.equal(summarizeCapabilityCoverage(descriptors, [
    { capabilityKey: descriptors[0].capabilityKey, outcome: 'EXECUTED_AND_PASSED', evidenceRefs: ['x'], reason: null },
    { capabilityKey: descriptors[0].capabilityKey, outcome: 'EXECUTED_AND_PASSED', evidenceRefs: ['x'], reason: null },
    { capabilityKey: descriptors[1].capabilityKey, outcome: 'EXECUTED_AND_PASSED', evidenceRefs: ['y'], reason: null },
  ]).certificationEligible, false)
})

test('coverage certifies only when every mandatory capability passes exactly once', () => {
  const descriptors = mandatoryAiGovernanceCapabilities.slice(0, 3)
  const summary = summarizeCapabilityCoverage(descriptors, descriptors.map(row => ({
    capabilityKey: row.capabilityKey,
    outcome: 'EXECUTED_AND_PASSED',
    evidenceRefs: ['canonical:evidence'],
    reason: null,
  })))
  assert.equal(summary.accountingCoveragePct, 100)
  assert.equal(summary.executionCoveragePct, 100)
  assert.equal(summary.certificationCoveragePct, 100)
  assert.equal(summary.certificationEligible, true)
})
