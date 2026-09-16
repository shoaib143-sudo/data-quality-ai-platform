import assert from 'node:assert/strict'
import fs from 'node:fs'

import { buildGovernanceOutcomeReport } from '../lib/orchestration/governance-outcome-report.ts'
import { renderGovernanceReportPdf, renderGovernanceReportPptx } from '../lib/orchestration/governance-report-export.ts'
import { buildExecutiveNarrationScript } from '../lib/orchestration/governance-report-narration.ts'
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
  reportId: 'report-assurance', projectId: 'project-a', orchestratorRunId: 'run-a', capabilityRunId: 'cap-a',
  generatedAt: '2026-09-16T00:00:00.000Z', persona: 'EXECUTIVE', depth: 'EXECUTIVE',
  scores: {
    governanceHealth: { status: 'MEASURED', value: 92, evidenceRefs: evidenced, method: 'test-authority' },
    businessImpact: { status: 'MEASURED', value: 99, evidenceRefs: [], method: 'unsupported' },
  },
  aggregationPolicy: { method: 'EQUAL_WEIGHT_EVIDENCED_DIMENSIONS', policyId: 'assurance-only-v1' },
  findings: [
    { id: 'risk-low', title: 'Low risk', severity: 'LOW', priorityRank: 10, status: 'UNRESOLVED', evidenceRefs: evidenced },
    { id: 'risk-critical', title: 'Critical risk', severity: 'CRITICAL', priorityRank: 1, status: 'UNRESOLVED', evidenceRefs: evidenced },
  ],
  businessImpact: [
    { id: 'impact-supported', statement: 'Measured impact', status: 'MEASURED', evidenceRefs: evidenced, value: 12, unit: 'records' },
    { id: 'impact-unsupported', statement: 'Invented impact', status: 'MEASURED', evidenceRefs: [], value: 1000000, unit: 'USD' },
  ],
  autonomousActivity: { totalAgentTasks: 4, autonomousActions: 3, humanInterventions: 0, changesRevalidated: 2, unresolvedIssues: 999 },
  certificationEligible: false, certificationCoveragePct: 80, evidenceRefs: evidenced,
})
assert.equal(report.scores.businessImpact.status, 'NOT_MEASURED')
assert.equal(report.scores.overall.value, 92)
assert.equal(report.businessImpact.length, 1)
assert.equal(report.mostImportantRisk?.id, 'risk-critical')
assert.equal(report.autonomousActivity.unresolvedIssues, 2)
assert.match(report.openingSummary, /no governed narrative severity policy is configured/i)
assert.doesNotMatch(report.openingSummary, /critical governance posture|urgent executive attention|strong governance posture/i)

const noAggregation = buildGovernanceOutcomeReport({
  ...report,
  reportId: 'report-no-policy',
  scores: { governanceHealth: report.scores.governanceHealth },
  findings: report.findings,
  businessImpact: report.businessImpact,
  certificationEligible: false,
  certificationCoveragePct: 80,
  evidenceRefs: evidenced,
  aggregationPolicy: undefined,
})
assert.equal(noAggregation.scores.overall.status, 'NOT_MEASURED')
assert.equal(noAggregation.scores.overall.value, null)

const createdAt = new Date('2026-09-16T00:00:00.000Z')
const envelope = createGovernedHandoffEnvelope({
  correlationId: 'correlation-a', parentRunId: 'supervisor-a', sourceRunId: 'run-source', sourceAgent: 'steward_agent',
  targetAgent: 'governance_analyst_agent', projectId: 'project-a', capabilityKey: 'governance_specialist_investigate',
  payloadType: 'native_supervisor_handoff_ref', payload: { sourceRunId: 'run-source', classification: 'CONFIDENTIAL' },
  evidenceRefs: evidenced, policySnapshotId: 'policy-snapshot-a', createdAt, ttlMs: 60_000,
})
const validContext = {
  projectId: 'project-a', targetAgent: 'governance_analyst_agent', allowedSourceAgents: ['steward_agent'],
  allowedHandoffTargets: { steward_agent: ['governance_analyst_agent'] }, policySnapshotId: 'policy-snapshot-a', dependencySatisfied: true,
  evidenceExists: (type, id, hash) => type === 'AGENT_RUN' && id === 'run-source' && hash === 'abc',
  now: new Date('2026-09-16T00:00:30.000Z'),
}
assert.equal(validateGovernedHandoff(envelope, validContext).status, 'PASS')

for (let index = 0; index < 250; index += 1) {
  const attack = index % 7
  const mutated = structuredClone(envelope)
  let context = { ...validContext }
  if (attack === 0) mutated.payload = { sourceRunId: 'run-source', classification: `TAMPER-${index}` }
  if (attack === 1) context = { ...context, projectId: `other-${index}` }
  if (attack === 2) context = { ...context, policySnapshotId: `other-policy-${index}` }
  if (attack === 3) context = { ...context, dependencySatisfied: false }
  if (attack === 4) context = { ...context, evidenceExists: () => false }
  if (attack === 5) context = { ...context, now: new Date('2026-09-16T00:02:00.000Z') }
  if (attack === 6) mutated.integrityHash = `${mutated.integrityHash.slice(0, -1)}${mutated.integrityHash.endsWith('0') ? '1' : '0'}`
  assert.equal(validateGovernedHandoff(mutated, context).status, 'FAIL', `attack ${attack} iteration ${index} must fail closed`)
}

assert.equal(nextHandoffState('SENT', 'DELIVERED'), 'DELIVERED')
assert.equal(nextHandoffState('DELIVERED', 'VALIDATED'), 'VALIDATED')
assert.equal(nextHandoffState('VALIDATED', 'ACCEPTED'), 'ACCEPTED')
for (const [from, to] of [['ACCEPTED','DELIVERED'], ['REJECTED','VALIDATED'], ['SENT','ACCEPTED'], ['DELIVERED','ACCEPTED']]) {
  assert.throws(() => nextHandoffState(from, to), /Illegal handoff transition/)
}

const persistence = fs.readFileSync('lib/agents/runtime/governed-handoff-persistence.ts', 'utf8')
assert.match(persistence, /\.eq\('state', input\.expectedState\)/, 'handoff transition must compare-and-set expected state')
assert.match(persistence, /lost a concurrency race/, 'concurrency race must be observable and fail closed')

assert.equal(classifyGovernanceFailure({ securityRelevant: true, retryable: true }).disposition, 'SECURITY_ESCALATION')
assert.equal(classifyGovernanceFailure({ policyDenied: true, retryable: true }).disposition, 'BLOCKED_POLICY')
assert.equal(classifyGovernanceFailure({ approvalRequired: true, retryable: true }).disposition, 'REQUIRES_APPROVAL')
assert.equal(classifyGovernanceFailure({ runtimeDefect: true }).disposition, 'DEBUGGER_REQUIRED')
for (let attempt = 0; attempt < 10; attempt += 1) {
  const decision = classifyGovernanceFailure({ retryable: true, attempt, maxAttempts: 3 })
  assert.equal(decision.retryAllowed, attempt < 3)
}
assert.equal(classifyGovernanceFailure({ ambiguous: true }).disposition, 'FAIL_CLOSED')
assert.equal(classifyGovernanceFailure({}).disposition, 'FAIL_CLOSED')

assert.equal(canMarkOriginalStepSucceeded({ debuggerOutcome: 'RECOVERED_AND_REVALIDATED', originalStepReexecuted: false, originalExitGatePassed: true }), false)
assert.equal(canMarkOriginalStepSucceeded({ debuggerOutcome: 'RECOVERED_AND_REVALIDATED', originalStepReexecuted: true, originalExitGatePassed: false }), false)
assert.equal(canMarkOriginalStepSucceeded({ debuggerOutcome: 'RECOVERED_AND_REVALIDATED', originalStepReexecuted: true, originalExitGatePassed: true }), true)
for (const outcome of ['RETRY_SAFE','REQUIRES_APPROVAL','REQUIRES_ROLLBACK','NOT_RECOVERABLE','SECURITY_ESCALATION']) {
  assert.equal(canMarkOriginalStepSucceeded({ debuggerOutcome: outcome, originalStepReexecuted: true, originalExitGatePassed: true }), false)
}

const pptx = renderGovernanceReportPptx(report)
const pdf = renderGovernanceReportPdf(report)
const narration = buildExecutiveNarrationScript(report)
assert.equal(pptx.subarray(0, 2).toString('ascii'), 'PK')
assert.equal(pdf.subarray(0, 8).toString('ascii'), '%PDF-1.4')
assert.ok(narration.includes('Statements not supported by governed evidence are intentionally omitted'))
assert.ok(!pptx.includes(Buffer.from('1000000 USD')))
assert.ok(!pdf.includes(Buffer.from('1000000 USD')))
assert.ok(!narration.includes('1000000 USD'))

const recoveryService = fs.readFileSync('lib/orchestration/governance-recovery-service.ts', 'utf8')
assert.match(recoveryService, /Do not mutate runtime, policy, source data, schemas, credentials, or governance truth\./)
assert.match(recoveryService, /const debuggerOutcome: RuntimeDebuggingOutcome = 'NOT_RECOVERABLE'/)
assert.match(recoveryService, /originalStepReexecuted: false/)
assert.match(recoveryService, /originalExitGatePassed: false/)

console.log('Final DataNexus governance orchestrator adversarial, concurrency and chaos assurance passed.')
