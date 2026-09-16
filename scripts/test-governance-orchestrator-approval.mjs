import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const routePath = new URL('../app/api/agents/governance-orchestrator/approvals/route.ts', import.meta.url)
const servicePath = new URL('../lib/orchestration/governance-orchestrator-approval-service.ts', import.meta.url)
const uiPath = new URL('../app/agents/autonomous-governance/orchestrator-approval-inbox.tsx', import.meta.url)

const [route, service, ui] = await Promise.all([
  readFile(routePath, 'utf8'),
  readFile(servicePath, 'utf8'),
  readFile(uiPath, 'utf8'),
])

test('approval decision uses existing governed approval authority and audit RPC', () => {
  assert.match(route, /recordAgentApprovalDecision/)
  assert.match(route, /loadApprovalDelegationWorkspace/)
  assert.match(route, /You do not hold current/)
  assert.match(route, /channel: 'DATANEXUS'/)
})

test('approval resume is bound to exact paused run and compare-and-set status', () => {
  assert.match(service, /resumeGovernanceOrchestratorAfterApproval/)
  assert.match(service, /goalHash !== String\(run\.goal_hash\)/)
  assert.match(service, /policy\.policyVersion !== String\(run\.policy_version\)/)
  assert.match(service, /\.eq\('status', 'WAITING_APPROVAL'\)/)
  assert.match(service, /resumed_exact_run: true/)
  assert.doesNotMatch(service, /runGovernanceOrchestrator\(/)
})

test('execution fingerprint is revalidated after approval and before resume', () => {
  const fingerprintIndex = route.indexOf('currentExecutionFingerprint')
  const validationIndex = route.indexOf('validateApprovalForExecution')
  const resumeIndex = route.lastIndexOf('resumeGovernanceOrchestratorAfterApproval')
  assert.ok(fingerprintIndex >= 0)
  assert.ok(validationIndex > fingerprintIndex)
  assert.ok(resumeIndex > validationIndex)
})

test('rejection keeps runtime fail closed', () => {
  assert.match(service, /approval_decision: 'REJECTED'/)
  assert.match(service, /status: 'BLOCKED_POLICY'/)
  assert.match(service, /changed concurrently; rejection was not applied/)
})

test('approval UI exposes required decision evidence and authorized actions', () => {
  for (const label of ['Requested action', 'Risk:', 'Orchestrator policy snapshot', 'Evidence / execution fingerprint', 'Requester']) {
    assert.ok(ui.includes(label), `missing approval UI label: ${label}`)
  }
  assert.match(ui, /Approve and resume/)
  assert.match(ui, />Reject</)
  assert.match(ui, /!approval\.canDecide/)
  assert.match(ui, /Runtime remains WAITING_APPROVAL/)
})
