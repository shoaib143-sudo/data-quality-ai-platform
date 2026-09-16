import assert from 'node:assert/strict'
import test from 'node:test'

import { createGovernedHandoffEnvelope, evaluateExitGate, nextHandoffState, validateGovernedHandoff } from '../lib/agents/runtime/governed-handoff.ts'

function envelope() {
  return createGovernedHandoffEnvelope({
    correlationId: 'corr-1', parentRunId: 'parent-1', sourceRunId: 'source-run-1',
    sourceAgent: 'steward_agent', targetAgent: 'governance_analyst_agent', projectId: 'project-1',
    capabilityKey: 'governance.analysis', payloadType: 'GOVERNANCE_EVIDENCE', payload: { answer: 42 },
    evidenceRefs: [{ type: 'AGENT_RUN', id: 'source-run-1' }], policySnapshotId: 'policy-1',
    createdAt: new Date('2026-09-16T00:00:00Z'), ttlMs: 60_000,
  })
}

function context() {
  return {
    projectId: 'project-1', targetAgent: 'governance_analyst_agent', allowedSourceAgents: ['steward_agent'],
    allowedHandoffTargets: { steward_agent: ['governance_analyst_agent'] }, policySnapshotId: 'policy-1',
    dependencySatisfied: true, evidenceExists: () => true, now: new Date('2026-09-16T00:00:30Z'),
  }
}

test('valid handoff passes entry gate', () => {
  assert.equal(validateGovernedHandoff(envelope(), context()).status, 'PASS')
})

test('tampered payload fails closed', () => {
  const value = envelope(); value.payload = { answer: 43 }
  const gate = validateGovernedHandoff(value, context())
  assert.equal(gate.status, 'FAIL')
  assert.ok(gate.checks.some(check => check.key === 'payload_hash' && check.status === 'FAIL'))
})

test('cross-project handoff fails closed', () => {
  const gate = validateGovernedHandoff(envelope(), { ...context(), projectId: 'project-2' })
  assert.equal(gate.status, 'FAIL')
})

test('untrusted sender or disallowed target fails closed', () => {
  const untrusted = validateGovernedHandoff(envelope(), { ...context(), allowedSourceAgents: [] })
  assert.equal(untrusted.status, 'FAIL')
  const disallowed = validateGovernedHandoff(envelope(), { ...context(), allowedHandoffTargets: { steward_agent: [] } })
  assert.equal(disallowed.status, 'FAIL')
})

test('expired handoff fails closed', () => {
  const gate = validateGovernedHandoff(envelope(), { ...context(), now: new Date('2026-09-16T00:02:00Z') })
  assert.equal(gate.status, 'FAIL')
})

test('missing evidence fails closed', () => {
  const gate = validateGovernedHandoff(envelope(), { ...context(), evidenceExists: () => false })
  assert.equal(gate.status, 'FAIL')
})

test('dependency failure blocks entry', () => {
  const gate = validateGovernedHandoff(envelope(), { ...context(), dependencySatisfied: false })
  assert.equal(gate.status, 'FAIL')
})

test('exit gate requires every mandatory check to pass', () => {
  assert.equal(evaluateExitGate([
    { key: 'executor_success', status: 'PASS' },
    { key: 'output_schema', status: 'PASS' },
    { key: 'evidence_persisted', status: 'FAIL', detail: 'Evidence missing.' },
  ]).status, 'FAIL')
  assert.equal(evaluateExitGate([{ key: 'executor_success', status: 'PASS' }, { key: 'evidence', status: 'NOT_MEASURED' }]).status, 'NOT_MEASURED')
})

test('handoff ACK lifecycle rejects illegal transitions', () => {
  assert.equal(nextHandoffState('SENT', 'DELIVERED'), 'DELIVERED')
  assert.equal(nextHandoffState('DELIVERED', 'VALIDATED'), 'VALIDATED')
  assert.equal(nextHandoffState('VALIDATED', 'ACCEPTED'), 'ACCEPTED')
  assert.throws(() => nextHandoffState('SENT', 'ACCEPTED'), /Illegal handoff transition/)
  assert.throws(() => nextHandoffState('ACCEPTED', 'REJECTED'), /Illegal handoff transition/)
})
