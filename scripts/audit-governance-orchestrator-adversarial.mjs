import assert from 'node:assert/strict'

import { buildGovernanceOutcomeReport } from '../lib/orchestration/governance-outcome-report.ts'
import {
  createGovernedHandoffEnvelope,
  nextHandoffState,
  validateGovernedHandoff,
} from '../lib/agents/runtime/governed-handoff.ts'
import {
  canMarkOriginalStepSucceeded,
  classifyGovernanceFailure,
} from '../lib/orchestration/governance-recovery.ts'

const evidenced = [{ type: 'AGENT_RUN', id: 'run-source', hash: 'abc' }]

const report = buildGovernanceOutcomeReport({
  reportId: 'report-adversarial',
  projectId: 'project-a',
  orchestratorRunId: 'orchestrator-run-a',
  capabilityRunId: 'capability-run-a',
  generatedAt: '2026-09-16T00:00:00.000Z',
  persona: 'EXECUTIVE',
  depth: 'EXECUTIVE',
  scores: {
    governanceHealth: { status: 'MEASURED', value: 92, evidenceRefs: evidenced, method: 'authoritative-test-evidence' },
    businessImpact: { status: 'MEASURED', value: 99, evidenceRefs: [], method: 'unsupported' },
  },
  findings: [
    { id: 'risk-low', title: 'Low risk', severity: 'LOW', priorityRank: 10, status: 'UNRESOLVED', evidenceRefs: evidenced },
    { id: 'risk-critical', title: 'Critical risk', severity: 'CRITICAL', priorityRank: 1, status: 'UNRESOLVED', evidenceRefs: evidenced },
  ],
  businessImpact: [
    { id: 'impact-supported', statement: 'Measured impact', status: 'MEASURED', evidenceRefs: evidenced, value: 12, unit: 'records' },
    { id: 'impact-unsupported', statement: 'Invented impact', status: 'MEASURED', evidenceRefs: [], value: 1000000, unit: 'USD' },
  ],
  autonomousActivity: { totalAgentTasks: 4, autonomousActions: 3, humanInterventions: 0, changesRevalidated: 2, unresolvedIssues: 999 },
  certificationEligible: false,
  certificationCoveragePct: 80,
  evidenceRefs: evidenced,
})

assert.equal(report.scores.governanceHealth.value, 92)
assert.equal(report.scores.businessImpact.status, 'NOT_MEASURED')
assert.equal(report.scores.businessImpact.value, null)
assert.equal(report.scores.overall.value, 92)
assert.equal(report.businessImpact.length, 1)
assert.equal(report.businessImpact[0].id, 'impact-supported')
assert.equal(report.mostImportantRisk?.id, 'risk-critical')
assert.equal(report.autonomousActivity.unresolvedIssues, 2)
assert.equal(report.unresolvedStatement, '2 issues remain unresolved.')
assert.match(report.assuranceStatement, /not complete/i)

const createdAt = new Date('2026-09-16T00:00:00.000Z')
const envelope = createGovernedHandoffEnvelope({
  correlationId: 'correlation-a',
  parentRunId: 'supervisor-a',
  sourceRunId: 'run-source',
  sourceAgent: 'steward_agent',
  targetAgent: 'governance_analyst_agent',
  projectId: 'project-a',
  capabilityKey: 'governance_specialist_investigate',
  payloadType: 'native_supervisor_handoff_ref',
  payload: { sourceRunId: 'run-source', classification: 'CONFIDENTIAL' },
  evidenceRefs: evidenced,
  policySnapshotId: 'policy-snapshot-a',
  createdAt,
  ttlMs: 60_000,
})

const validContext = {
  projectId: 'project-a',
  targetAgent: 'governance_analyst_agent',
  allowedSourceAgents: ['steward_agent'],
  allowedHandoffTargets: { steward_agent: ['governance_analyst_agent'] },
  policySnapshotId: 'policy-snapshot-a',
  dependencySatisfied: true,
  evidenceExists: (type, id, hash) => type === 'AGENT_RUN' && id === 'run-source' && hash === 'abc',
  now: new Date('2026-09-16T00:00:30.000Z'),
}

assert.equal(validateGovernedHandoff(envelope, validContext).status, 'PASS')
assert.equal(validateGovernedHandoff({ ...envelope, payload: { sourceRunId: 'run-source', classification: 'PUBLIC' } }, validContext).status, 'FAIL')
assert.equal(validateGovernedHandoff(envelope, { ...validContext, projectId: 'project-b' }).status, 'FAIL')
assert.equal(validateGovernedHandoff(envelope, { ...validContext, policySnapshotId: 'policy-snapshot-b' }).status, 'FAIL')
assert.equal(validateGovernedHandoff(envelope, { ...validContext, dependencySatisfied: false }).status, 'FAIL')
assert.equal(validateGovernedHandoff(envelope, { ...validContext, evidenceExists: () => false }).status, 'FAIL')
assert.equal(validateGovernedHandoff(envelope, { ...validContext, now: new Date('2026-09-16T00:02:00.000Z') }).status, 'FAIL')
assert.throws(() => nextHandoffState('ACCEPTED', 'DELIVERED'), /Illegal handoff transition/)

assert.equal(classifyGovernanceFailure({ securityRelevant: true }).disposition, 'SECURITY_ESCALATION')
assert.equal(classifyGovernanceFailure({ policyDenied: true }).disposition, 'BLOCKED_POLICY')
assert.equal(classifyGovernanceFailure({ approvalRequired: true }).disposition, 'REQUIRES_APPROVAL')
assert.equal(classifyGovernanceFailure({ runtimeDefect: true }).disposition, 'DEBUGGER_REQUIRED')
assert.equal(classifyGovernanceFailure({ retryable: true, attempt: 0, maxAttempts: 1 }).retryAllowed, true)
assert.equal(classifyGovernanceFailure({ retryable: true, attempt: 1, maxAttempts: 1 }).retryAllowed, false)
assert.equal(classifyGovernanceFailure({ ambiguous: true }).disposition, 'FAIL_CLOSED')

assert.equal(canMarkOriginalStepSucceeded({ debuggerOutcome: 'RECOVERED_AND_REVALIDATED', originalStepReexecuted: false, originalExitGatePassed: true }), false)
assert.equal(canMarkOriginalStepSucceeded({ debuggerOutcome: 'RECOVERED_AND_REVALIDATED', originalStepReexecuted: true, originalExitGatePassed: false }), false)
assert.equal(canMarkOriginalStepSucceeded({ debuggerOutcome: 'RECOVERED_AND_REVALIDATED', originalStepReexecuted: true, originalExitGatePassed: true }), true)

console.log('Governance orchestrator adversarial assurance audit passed.')
