import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const coach = readFileSync('app/agents/autonomous-governance/guided-run-coach.tsx', 'utf8')
const consoleUi = readFileSync('app/agents/autonomous-governance/autonomy-console.tsx', 'utf8')
const approvalUi = readFileSync('app/agents/autonomous-governance/orchestrator-approval-inbox.tsx', 'utf8')
const approvalApi = readFileSync('app/api/agents/governance-orchestrator/approvals/route.ts', 'utf8')
const readinessApi = readFileSync('app/api/agents/governance-orchestrator/guided-readiness/route.ts', 'utf8')
const page = readFileSync('app/agents/autonomous-governance/page.tsx', 'utf8')

test('the actual GUIDED journey is visible with seven numbered steps and an actionable on-screen instruction', () => {
  for (const label of ['GUIDED governance E2E','Do this now','Select project','Verify tables',
    'Activate GUIDED','Submit goal','Human approval','Review evidence','Independent certification']) {
    assert.ok(coach.includes(label), label)
  }
  assert.match(coach, /aria-live="polite"/)
  assert.match(coach, /aria-current=\{current \? 'step'/)
  assert.match(coach, /href=\{instruction.target\}/)
  assert.match(coach, /min-h-10/)
  assert.match(coach, /text-sm/)
  assert.match(coach, /border-amber/)
})
test('guided source preflight uses real project-scoped catalog state, not fabricated progress', () => {
  assert.match(readinessApi, /requireApiUser\(\)/)
  assert.match(readinessApi, /authorizeProject\(user\.id, projectId, 'agent\.view'\)/)
  assert.match(readinessApi, /\.eq\('project_id', projectId\)/)
  assert.match(readinessApi, /current_version_id/)
  assert.match(readinessApi, /source_identifier/)
  assert.match(readinessApi, /dataset_execution_sources/)
  assert.match(readinessApi, /is_current/)
  assert.match(readinessApi, /'Cache-Control': 'no-store'/)
  assert.doesNotMatch(readinessApi, /jdbc_url|credential_ref|service_role/)
  assert.match(coach, /readiness\.readyCount/)
  assert.match(coach, /readiness\.tables\.map/)
  assert.match(coach, /NOT_REGISTERED/)
})
test('unsaved policy and emergency-stop state block the run, and paused approvals are polled', () => {
  assert.match(consoleUi, /setPersistedPolicy\(body\.policy\)/)
  assert.match(consoleUi, /persistedGuidedReady/)
  assert.match(consoleUi, /!readiness\?\.ready/)
  assert.match(consoleUi, /persistedPolicy\.emergencyStop/)
  assert.match(consoleUi, /hasUnsavedPolicyEdits/)
  assert.match(consoleUi, /executionBlocked/)
  assert.match(consoleUi, /'WAITING_APPROVAL', 'RUNNING'/)
  assert.match(consoleUi, /window\.setInterval/)
  assert.match(consoleUi, /role="status" aria-live="polite"/)
  assert.match(page, /initialProjectId/)
})
test('reviewer sees exact user-submitted goal and must confirm; execution authority checked on ready requests', () => {
  assert.match(approvalApi, /originalGoal: text\(parameters\.goal\)/)
  assert.match(approvalApi, /authorizeProject\(user\.id, projectId, 'agent\.execute'\)/)
  assert.match(approvalUi, /approval\.originalGoal/)
  assert.match(approvalUi, /confirmedByApproval/)
  assert.match(approvalUi, /readOnly value=\{goalByApproval\[approval\.id\]/)
  assert.match(approvalUi, /!approval\.originalGoal \|\| !confirmedByApproval\[approval\.id\]/)
  assert.match(approvalUi, /Approval resumes only the exact paused run, never certifies it/)
  assert.doesNotMatch(approvalUi, /DEFAULT_GOAL/)
})
test('independent certification is not represented as complete on execution success alone', () => {
  assert.match(consoleUi, /certificationReady/)
  assert.match(consoleUi, /summaryRow\.certificationEligible === true/)
  assert.match(consoleUi, /assessment_state/)
  assert.match(consoleUi, /!certificationReady/)
  assert.match(coach, /cannot grant approvals or certify a run/)
})
