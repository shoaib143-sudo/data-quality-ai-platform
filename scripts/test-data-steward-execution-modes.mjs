import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateAutonomyPolicy } from '../lib/orchestration/governance-orchestrator.ts'
import { personaAcceptanceTasks } from '../lib/governance/persona-acceptance-tasks.ts'
import {
  dataStewardAutonomyPolicy,
  dataStewardGovernanceFixture as fixture,
} from '../tests/fixtures/data-steward-governance-fixture.mjs'

test('Data Steward E2E fixture contains representative state for every canonical task', () => {
  const tasks = personaAcceptanceTasks['data-steward']
  const ids = new Set(tasks.map(task => task.id))
  for (const expected of [
    'stewardship-triage',
    'quality-followup',
    'glossary-curation',
    'classification-review',
    'steward-issues',
  ]) assert.equal(ids.has(expected), true, expected)

  assert.equal(fixture.organization.role, 'MEMBER')
  assert.equal(fixture.user.roleKey, 'DATA_STEWARD')
  assert.equal(fixture.dataset.projectId, fixture.project.id)
  assert.equal(fixture.datasetVersion.datasetId, fixture.dataset.id)
  assert.equal(fixture.profileRun.datasetVersionId, fixture.datasetVersion.id)
  assert.equal(fixture.profileRun.status, 'COMPLETED')
  assert.equal(fixture.qualityRule.datasetId, fixture.dataset.id)
  assert.equal(fixture.qualityRule.enabled, true)
  assert.equal(fixture.finding.profileRunId, fixture.profileRun.id)
  assert.equal(fixture.glossaryTerm.projectId, fixture.project.id)
  assert.equal(fixture.classification.projectId, fixture.project.id)
  assert.equal(fixture.issue.findingId, fixture.finding.id)
  assert.equal(fixture.stewardshipAssignment.datasetId, fixture.dataset.id)
  assert.notEqual(fixture.unauthorizedProject.id, fixture.project.id)
})

test('Data Steward fixture preserves explicit positive and negative authority sets', () => {
  for (const capability of [
    'stewardship.manage',
    'quality.execute',
    'glossary.manage',
    'classification.review',
    'issues.manage',
    'agent.execute',
  ]) assert.ok(fixture.capabilities.includes(capability), capability)

  for (const forbidden of [
    'admin.manage',
    'source.manage',
    'schedule.manage',
    'policy.approve',
    'quality.exception.approve',
    'execution.approve',
    'agent.admin',
  ]) {
    assert.ok(fixture.prohibitedCapabilities.includes(forbidden), forbidden)
    assert.equal(fixture.capabilities.includes(forbidden), false, forbidden)
  }
})

test('OFF mode remains manual and denies autonomous Data Steward execution', () => {
  const decision = evaluateAutonomyPolicy(
    dataStewardAutonomyPolicy('OFF'),
    {
      riskTier: 'LOW',
      actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR',
      agentKey: 'governance_orchestrator_agent',
      toolKey: 'read',
      mutationClass: 'SAFE_REVERSIBLE',
    },
  )
  assert.equal(decision.allowed, false)
  assert.equal(decision.requiresApproval, false)
})

test('GUIDED mode allows eligible Data Steward work but requires approval', () => {
  const decision = evaluateAutonomyPolicy(
    dataStewardAutonomyPolicy('GUIDED'),
    {
      riskTier: 'LOW',
      actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR',
      agentKey: 'governance_orchestrator_agent',
      toolKey: 'quality',
      mutationClass: 'SAFE_REVERSIBLE',
    },
  )
  assert.equal(decision.allowed, true)
  assert.equal(decision.requiresApproval, true)
})

test('GOVERNED_AUTO allows low-risk Data Steward execution within an existing policy', () => {
  const decision = evaluateAutonomyPolicy(
    dataStewardAutonomyPolicy('GOVERNED_AUTO'),
    {
      riskTier: 'LOW',
      actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR',
      agentKey: 'governance_orchestrator_agent',
      toolKey: 'stewardship',
      mutationClass: 'SAFE_REVERSIBLE',
    },
  )
  assert.equal(decision.allowed, true)
  assert.equal(decision.requiresApproval, false)
})

test('FULL_AUTONOMOUS remains goal-driven but bounded for Data Steward', () => {
  const policy = dataStewardAutonomyPolicy('FULL_AUTONOMOUS')
  const allowed = evaluateAutonomyPolicy(policy, {
    riskTier: 'MEDIUM',
    actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR',
    agentKey: 'governance_orchestrator_agent',
    toolKey: 'glossary',
    mutationClass: 'SAFE_REVERSIBLE',
  })
  assert.equal(allowed.allowed, true)
  assert.equal(allowed.requiresApproval, false)

  const disallowedTool = evaluateAutonomyPolicy(policy, {
    riskTier: 'LOW',
    actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR',
    agentKey: 'governance_orchestrator_agent',
    toolKey: 'platform_admin',
    mutationClass: 'SAFE_REVERSIBLE',
  })
  assert.equal(disallowedTool.allowed, false)

  const destructive = evaluateAutonomyPolicy(policy, {
    riskTier: 'LOW',
    actionKey: 'DESTRUCTIVE_ACTION',
    agentKey: 'governance_orchestrator_agent',
    toolKey: 'issues',
    mutationClass: 'SAFE_REVERSIBLE',
  })
  assert.equal(destructive.allowed, true)
  assert.equal(destructive.requiresApproval, true)
})

test('emergency stop overrides every non-OFF Data Steward autonomous mode', () => {
  for (const mode of ['GUIDED', 'GOVERNED_AUTO', 'FULL_AUTONOMOUS']) {
    const decision = evaluateAutonomyPolicy(
      { ...dataStewardAutonomyPolicy(mode), emergencyStop: true },
      {
        riskTier: 'LOW',
        actionKey: 'RUN_GOVERNANCE_ORCHESTRATOR',
        agentKey: 'governance_orchestrator_agent',
        toolKey: 'read',
        mutationClass: 'SAFE_REVERSIBLE',
      },
    )
    assert.equal(decision.allowed, false, mode)
    assert.match(decision.reason, /Emergency stop/)
  }
})
