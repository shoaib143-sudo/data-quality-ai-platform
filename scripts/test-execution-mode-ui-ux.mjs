import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const consoleUi = fs.readFileSync('app/agents/autonomous-governance/autonomy-console.tsx', 'utf8')
const approvalUi = fs.readFileSync('app/agents/autonomous-governance/orchestrator-approval-inbox.tsx', 'utf8')
const scheduleUi = fs.readFileSync('app/schedules/schedule-manager.tsx', 'utf8')
const recoveryUi = fs.readFileSync('app/recovery/recovery-actions.tsx', 'utf8')

test('autonomy UI exposes all selectable operating modes and disables execution in OFF', () => {
  for (const mode of ['OFF', 'GUIDED', 'GOVERNED_AUTO', 'FULL_AUTONOMOUS']) {
    assert.ok(consoleUi.includes(`'${mode}'`), `missing operating mode ${mode}`)
  }
  assert.match(consoleUi, /policy\.mode === 'OFF'/)
  assert.match(consoleUi, /Operating mode/)
  assert.match(consoleUi, /Emergency stop/)
})

test('goal-driven UI explains authority and independent certification', () => {
  assert.match(consoleUi, /Execution goal/)
  assert.match(consoleUi, /agent execution permission/)
  assert.match(consoleUi, /Independent certification/)
  assert.match(consoleUi, /Certification requires separate certification\.review authority/)
})

test('human-in-the-loop UI presents evidence before decision and preserves fail-closed status', () => {
  for (const label of ['Requested action', 'Risk:', 'Orchestrator policy snapshot', 'Evidence / execution fingerprint', 'Requester']) {
    assert.ok(approvalUi.includes(label), `missing decision evidence label ${label}`)
  }
  assert.match(approvalUi, /Approve and resume/)
  assert.match(approvalUi, />Reject</)
  assert.match(approvalUi, /Runtime remains WAITING_APPROVAL/)
})

test('system-triggered execution UI exposes cadence, next run, retry and misfire behavior', () => {
  for (const text of ['New recurring schedule', 'Cadence', 'Missed-run handling', 'Run calendar', 'next ', 'misfire ', 'retries ']) {
    assert.ok(scheduleUi.includes(text), `missing schedule UX contract: ${text}`)
  }
  assert.match(scheduleUi, /Pause/)
  assert.match(scheduleUi, /Resume/)
})

test('recovery UI keeps operator actions evidence based rather than implying automatic success', () => {
  assert.match(recoveryUi, /recovery/i)
  assert.doesNotMatch(recoveryUi, /mark.*success/i)
})
