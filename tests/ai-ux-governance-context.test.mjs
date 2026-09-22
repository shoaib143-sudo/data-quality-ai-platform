import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const insights = fs.readFileSync('app/ai-insights/page.tsx','utf8')
const registry = fs.readFileSync('app/agents/page.tsx','utf8')
const detail = fs.readFileSync('app/agents/[agentKey]/[version]/page.tsx','utf8')
const run = fs.readFileSync('app/agents/runs/[runId]/page.tsx','utf8')
const posture = fs.readFileSync('app/ai-capabilities/page.tsx','utf8')

test('Ask DataNexus stays contextual and evidence grounded', () => {
  assert.match(insights, /Contextual copilot/)
  assert.match(insights, /Governed evidence only/)
  assert.match(insights, /Open Dataset 360/)
  assert.match(insights, /question remains context, not governance authority/)
})

test('agent registry exposes operational footprint', () => {
  assert.match(registry, /runsByAgent/)
  assert.match(registry, /touchedDatasets/)
  assert.match(registry, /Governed AI operations/)
})

test('agent detail behaves as an Agent 360 view', () => {
  assert.match(detail, /aria-label="Agent 360 views"/)
  assert.match(detail, /Datasets touched/)
  assert.match(detail, /Projects observed/)
  assert.match(detail, /id="tools"/)
  assert.match(detail, /id="activity"/)
})

test('agent run surfaces explainability and approval guardrails', () => {
  assert.match(run, /aria-label="Agent run evidence views"/)
  assert.match(run, /Approval gates/)
  assert.match(run, /Max observed risk tier/)
  assert.match(run, /sideEffectingTools/)
  assert.match(run, /approvalInterrupts/)
  assert.match(run, /id="guardrails"/)
})

test('AI posture links capability evidence to operational controls', () => {
  assert.match(posture, /AI posture & controls/)
  assert.match(posture, /Operational AI control plane/)
  assert.match(posture, /Agent registry/)
  assert.match(posture, /Execution activity/)
})


test('agent execution preflight exposes permission mode before action', () => {
  const runForm = fs.readFileSync('app/agents/run-agent-form.tsx','utf8')
  assert.match(runForm, /Execution preflight/)
  assert.match(runForm, /READ_ONLY_CONVERSATION/)
  assert.match(runForm, /AUTHORIZED_EXECUTION/)
  assert.match(runForm, /APPROVAL_REQUIRED/)
  assert.match(runForm, /NOT_AUTHORIZED/)
})

test('AI recommendations expose advisory provenance', () => {
  assert.match(insights, /ADVISORY/)
  assert.match(insights, /Evidence used/)
  assert.match(insights, /suggestion\.evidence/)
})

test('AI posture includes evidence-domain coverage', () => {
  assert.match(posture, /Coverage by evidence domain/)
  assert.match(posture, /Where AI is actually evidenced/)
  assert.match(posture, /domainCoverage/)
})

test('agent execution returns to governed asset context', () => {
  assert.match(run, /Dataset 360/)
  assert.match(run, /Live execution context/)
  assert.match(run, /parent_run_id/)
})
