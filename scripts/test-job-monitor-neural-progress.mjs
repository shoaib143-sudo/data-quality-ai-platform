import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const monitor = fs.readFileSync('app/monitoring/job-monitor.tsx', 'utf8')
const page = fs.readFileSync('app/monitoring/page.tsx', 'utf8')
const api = fs.readFileSync('app/api/monitoring/runs/route.ts', 'utf8')

test('neural progress is hydrated from persisted agent run steps', () => {
  assert.match(page, /from\('agent_run_steps'\)/)
  assert.match(page, /initialSteps=\{typedSteps\}/)
  assert.match(monitor, /initialSteps\?: MonitoringStep\[\]/)
  assert.match(monitor, /const \[steps, setSteps\] = useState\(initialSteps\)/)
})

test('polling refreshes runs and step evidence together', () => {
  assert.match(api, /steps: stepsResult\.data \?\? \[\]/)
  assert.match(monitor, /steps\?: MonitoringStep\[\]/)
  assert.match(monitor, /setSteps\(payload\.steps \?\? \[\]\)/)
  assert.match(monitor, /window\.setInterval\(\(\) => void refresh\(\), 5000\)/)
})

test('execution pulse renders ordered evidence states without inventing completion', () => {
  assert.match(monitor, /Selected execution pulse/)
  assert.match(monitor, /step_order - b\.step_order/)
  assert.match(monitor, /selectedRunProgress/)
  assert.match(monitor, /WAITING_APPROVAL/)
  assert.match(monitor, /AWAITING_APPROVAL/)
  assert.match(monitor, /VERIFIED/)
  assert.match(monitor, /hasFailedStep \? 'FAILED'/)
  assert.match(monitor, /hasRunningStep \? 'RUNNING'/)
  assert.match(monitor, /hasWaitingStep \? 'WAITING'/)
})

test('missing step evidence does not manufacture a successful execution pulse', () => {
  assert.match(monitor, /selectedRunSteps\.length[\s\S]*: null/)
  assert.match(monitor, /selectedRunId && selectedRunSteps\.length > 0/)
  assert.doesNotMatch(monitor, /Math\.random|fakeProgress|simulatedProgress/i)
})
