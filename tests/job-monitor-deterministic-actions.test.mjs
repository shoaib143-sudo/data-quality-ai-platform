import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const resolver = fs.readFileSync(new URL('../lib/monitoring/run-actions.ts', import.meta.url), 'utf8')
const route = fs.readFileSync(new URL('../app/api/monitoring/runs/[runId]/actions/route.ts', import.meta.url), 'utf8')
const panel = fs.readFileSync(new URL('../app/monitoring/job-run-actions.tsx', import.meta.url), 'utf8')
const monitor = fs.readFileSync(new URL('../app/monitoring/job-monitor.tsx', import.meta.url), 'utf8')

test('Job Monitor resolves each privileged action through its exact capability', () => {
  for (const [action, capability] of [
    ['EXECUTE', 'agent.execute'],
    ['RETRY', 'execution.retry'],
    ['CANCEL', 'execution.cancel'],
    ['APPROVE', 'execution.approve'],
    ['ADMIN', 'agent.admin'],
  ]) {
    assert.match(resolver, new RegExp(`${action}: '${capability.replace('.', '\\.')}'`))
  }
  assert.match(resolver, /authorizeAgentAction\(userId, capability, resource\)/)
})

test('run action discovery is itself resource scoped and fail closed', () => {
  assert.match(route, /'execution\.view'/)
  assert.match(route, /authorizeAgentAction/)
  assert.match(route, /status: 404/)
  assert.match(route, /'Cache-Control': 'private, no-store'/)
})

test('Job Monitor does not infer privileged actions in the browser', () => {
  assert.match(panel, /\/api\/monitoring\/runs\/\$\{encodeURIComponent\(runId\)\}\/actions/)
  assert.doesNotMatch(panel, /cancellableProjectIds|hasProjectCapability|persona/i)
  assert.match(panel, /action\.available/)
  assert.match(panel, /Navigation actions never execute a mutation by themselves/)
  assert.match(monitor, /<JobRunActions runId=\{selectedRunId\}/)
})

test('only cancel is currently invoked as a direct Job Monitor mutation', () => {
  assert.match(resolver, /action === 'CANCEL'.*mode: 'MUTATION'/s)
  assert.match(resolver, /RETRY.*href: '\/recovery'/s)
  assert.match(resolver, /APPROVE.*href: '\/approvals'/s)
  assert.match(resolver, /EXECUTE.*href: '\/agents'/s)
  assert.match(panel, /method: 'POST'/)
})
