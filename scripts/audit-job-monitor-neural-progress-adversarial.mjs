import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync('app/monitoring/page.tsx', 'utf8')
const api = fs.readFileSync('app/api/monitoring/runs/route.ts', 'utf8')
const monitor = fs.readFileSync('app/monitoring/job-monitor.tsx', 'utf8')

assert.match(page, /const typedRuns = await filterAuthorizedExecutionRuns/, 'initial monitoring state must authorize runs before any step evidence is loaded')
assert.match(page, /const runIds = typedRuns\.map\(\(run\) => run\.id\)/, 'initial step hydration must derive ids only from authorized runs')
assert.match(page, /from\('agent_run_steps'\)[\s\S]*\.in\('agent_run_id', runIds\)/, 'initial step evidence must be scoped to authorized run ids')

assert.match(api, /const visibleRuns = await filterAuthorizedExecutionRuns/, 'refresh endpoint must authorize runs before step hydration')
assert.match(api, /const runIds = visibleRuns\.map\(run => run\.id\)/, 'refresh step hydration must derive ids only from authorized runs')
assert.match(api, /from\('agent_run_steps'\)[\s\S]*\.in\('agent_run_id', runIds\)/, 'refresh step evidence must be scoped to authorized run ids')

assert.match(monitor, /const hasFailedStep =[\s\S]*const hasRunningStep =[\s\S]*const hasWaitingStep =/, 'neural edge state must derive from persisted step evidence')
assert.match(monitor, /hasFailedStep \? 'FAILED' : hasRunningStep \? 'RUNNING' : hasWaitingStep \? 'WAITING' : runStatus/, 'evidence precedence must fail closed: failed, then running, then waiting, then run state')
assert.match(monitor, /selectedRunSteps\.length[\s\S]*: null/, 'evidence completion must remain null when no selected step evidence exists')
assert.match(monitor, /selectedRunId && selectedRunSteps\.length > 0/, 'execution pulse must not render without persisted step evidence')
assert.match(monitor, /\.sort\(\(a, b\) => a\.step_order - b\.step_order \|\| a\.attempt - b\.attempt\)/, 'execution pulse ordering must be deterministic by step order and attempt')
assert.match(monitor, /window\.setInterval\(\(\) => void refresh\(\), 5000\)/, 'polling cadence must remain bounded')
assert.match(monitor, /if \(!response\.ok\) return/, 'failed refresh must not overwrite the current evidence snapshot with an error payload')
assert.doesNotMatch(monitor, /Math\.random|fakeProgress|simulatedProgress|setTimeout\([^)]*progress/i, 'neural progress must never invent or randomly advance execution evidence')
assert.doesNotMatch(monitor, /\/api\/jobs\/worker/, 'observability must not trigger worker execution')

console.log('Independent adversarial neural progress audit passed: authorization-scoped step hydration, fail-closed evidence precedence, deterministic ordering, bounded polling, non-destructive refresh failure handling, and no synthetic progress.')
