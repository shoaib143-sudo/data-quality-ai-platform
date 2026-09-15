import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'
import {
  CANONICAL_AI_CAPABILITY_COUNT,
  evaluateAutonomyPolicy,
  summarizeCanonicalCapabilityLedger,
  validateBlastRadius,
  validateCapabilityPlan,
} from '../lib/orchestration/governance-orchestrator.ts'

const policy = {
  mode: 'FULL_AUTONOMOUS', enabled: true, policyVersion: 'test-v1', maximumRiskTier: 'LOW',
  allowedAgentKeys: ['governance_orchestrator_agent'], allowedToolKeys: ['read'], allowedModelClasses: ['approved'], allowedMutationClasses: [],
  approvalRequiredActions: ['HIGH_RISK_ACTION'], autoRemediationEnabled: false, autoRollbackEnabled: true,
  maxExecutionBudget: 10, maxModelBudget: 5, maxRuntimeMs: 300000, maxDatasetsChangedPerRun: 1, maxProjectsAffectedPerRun: 1,
  maxRemediationActionsPerHour: 0, maxConcurrentModelCalls: 2, emergencyStop: false,
}

function canonicalRows(overrides = {}) {
  return Array.from({ length: CANONICAL_AI_CAPABILITY_COUNT }, (_, index) => ({
    capability_sr_no: index + 1, module: 'TEST', capability: `Capability ${index + 1}`,
    execution_state: 'EXECUTED', verification_state: 'VERIFIED', blocker_code: null, ...overrides,
  }))
}

test('canonical capability count remains 75 and integration reuses existing ledger', () => {
  assert.equal(CANONICAL_AI_CAPABILITY_COUNT, 75)
  const migration = fs.readFileSync('supabase/migrations/20260916000000_governance_orchestrator_control_plane.sql', 'utf8')
  const service = fs.readFileSync('lib/orchestration/governance-orchestrator-service-v2.ts', 'utf8')
  assert.match(migration, /governance\.ai_capability_e2e_runs/)
  assert.match(service, /create_ai_capability_e2e_run/)
  assert.match(service, /finalize_ai_capability_e2e_run/)
  assert.doesNotMatch(migration, /create table if not exists (?:orchestration|governance)\.coverage_runs/i)
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
    'Dataset blast-radius limit exceeded.', 'Project blast-radius limit exceeded.', 'Remediation rate limit exceeded.',
  ])
})

test('plan validation rejects unknown dependencies and cycles', () => {
  const base = { domain: 'GOVERNANCE', version: '1.0', mandatoryForE2E: true, executorType: 'AGENT', executorKey: 'x', requiredCapability: 'agent.execute', riskTier: 'LOW', evidenceContract: ['evidence'], certificationGate: 'gate', enabled: true }
  assert.ok(validateCapabilityPlan([{ ...base, capabilityKey: 'a', dependencies: ['missing'] }]).some(message => message.includes('unknown dependency')))
  assert.ok(validateCapabilityPlan([{ ...base, capabilityKey: 'a', dependencies: ['b'] }, { ...base, capabilityKey: 'b', dependencies: ['a'] }]).some(message => message.includes('cycle')))
})

test('canonical coverage fails closed when any capability is missing', () => {
  const summary = summarizeCanonicalCapabilityLedger(canonicalRows().slice(0, 74))
  assert.equal(summary.accounted, 74); assert.equal(summary.unaccounted, 1); assert.equal(summary.certificationEligible, false)
})

test('canonical coverage rejects duplicate and out of range capability identities', () => {
  const duplicated = canonicalRows(); duplicated[74] = { ...duplicated[74], capability_sr_no: 74 }
  assert.equal(summarizeCanonicalCapabilityLedger(duplicated).certificationEligible, false)
  const outOfRange = canonicalRows(); outOfRange[74] = { ...outOfRange[74], capability_sr_no: 76 }
  assert.equal(summarizeCanonicalCapabilityLedger(outOfRange).certificationEligible, false)
})

test('canonical coverage cannot certify blocked failed or inconclusive outcomes', () => {
  const blocked = canonicalRows(); blocked[0] = { ...blocked[0], execution_state: 'BLOCKED', verification_state: 'UNKNOWN', blocker_code: 'POLICY' }
  assert.equal(summarizeCanonicalCapabilityLedger(blocked).certificationEligible, false)
  const failed = canonicalRows(); failed[1] = { ...failed[1], execution_state: 'FAILED', verification_state: 'FAILED' }
  assert.equal(summarizeCanonicalCapabilityLedger(failed).certificationEligible, false)
  const inconclusive = canonicalRows(); inconclusive[2] = { ...inconclusive[2], verification_state: 'INCONCLUSIVE' }
  assert.equal(summarizeCanonicalCapabilityLedger(inconclusive).certificationEligible, false)
})

test('canonical coverage certifies only all 75 executed and independently verified exactly once', () => {
  const summary = summarizeCanonicalCapabilityLedger(canonicalRows())
  assert.equal(summary.accountingCoveragePct, 100); assert.equal(summary.executionCoveragePct, 100); assert.equal(summary.certificationCoveragePct, 100); assert.equal(summary.certificationEligible, true)
})
