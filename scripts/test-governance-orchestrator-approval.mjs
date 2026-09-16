import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const routePath = new URL('../app/api/agents/governance-orchestrator/approvals/route.ts', import.meta.url)
const servicePath = new URL('../lib/orchestration/governance-orchestrator-approval-service.ts', import.meta.url)
const uiPath = new URL('../app/agents/autonomous-governance/orchestrator-approval-inbox.tsx', import.meta.url)
const executeRoutePath = new URL('../app/api/agent-approvals/[requestId]/execute/route.ts', import.meta.url)
const orchestratorRoutePath = new URL('../app/api/agents/governance-orchestrator/route.ts', import.meta.url)

const [route, service, ui, executeRoute, orchestratorRoute] = await Promise.all([
  readFile(routePath, 'utf8'),
  readFile(servicePath, 'utf8'),
  readFile(uiPath, 'utf8'),
  readFile(executeRoutePath, 'utf8'),
  readFile(orchestratorRoutePath, 'utf8'),
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


test('approval inbox execution resumes orchestrator through exact-run service', () => {
  assert.match(executeRoute, /parameters\.orchestratorRunId/)
  assert.match(executeRoute, /resumeGovernanceOrchestratorAfterApproval\(/)
  assert.match(executeRoute, /reviewerUserId: user\.id/)
  assert.match(executeRoute, /goal,/)
  assert.match(executeRoute, /predates resumable execution payloads/)
})

test('new governed orchestrator approvals fingerprint the exact goal required for resume', () => {
  assert.match(orchestratorRoute, /goalHash: createHash\('sha256'\)\.update\(goal\)\.digest\('hex'\),\s*goal,/)
})
