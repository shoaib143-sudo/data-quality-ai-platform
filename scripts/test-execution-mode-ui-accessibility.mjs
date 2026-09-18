import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const autonomy = fs.readFileSync('app/agents/autonomous-governance/autonomy-console.tsx', 'utf8')
const approvals = fs.readFileSync('app/agents/autonomous-governance/orchestrator-approval-inbox.tsx', 'utf8')
const schedules = fs.readFileSync('app/schedules/schedule-manager.tsx', 'utf8')

test('operating mode choices expose plain-language execution categories', () => {
  for (const category of [
    'Manual',
    'Assisted / Human-in-the-loop',
    'Automated / Human-on-the-loop',
    'Autonomous goal-driven',
  ]) assert.ok(autonomy.includes(category), `missing category guidance: ${category}`)
  assert.match(autonomy, /modeGuidance\[policy\.mode\]\.description/)
})

test('operating mode control announces selection semantics', () => {
  assert.match(autonomy, /role="group"/)
  assert.match(autonomy, /aria-labelledby="operating-mode-label"/)
  assert.match(autonomy, /aria-pressed=\{policy\.mode === mode\}/)
  assert.match(autonomy, /aria-describedby="operating-mode-help"/)
  assert.match(autonomy, /aria-live="polite"/)
})

test('execution and approval outcomes are announced without changing authority', () => {
  assert.match(autonomy, /role="status" aria-live="polite"/)
  assert.match(approvals, /role="status" aria-live="polite"/)
  assert.match(approvals, /Approve and resume/)
  assert.match(approvals, />Reject</)
})

test('system-trigger schedule icon actions have explicit accessible names', () => {
  assert.ok(schedules.includes("aria-label={`${s.enabled?'Pause':'Resume'} schedule ${s.name}`}"))
  assert.ok(schedules.includes('aria-label={`Delete schedule ${s.name}`}'))
  assert.match(schedules, /aria-hidden="true"/)
})
