import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync(new URL('../app/agents/runs/[runId]/page.tsx', import.meta.url), 'utf8')
const resource = fs.readFileSync(new URL('../lib/governance/resource-authorization.ts', import.meta.url), 'utf8')

test('direct Agent Run detail rechecks resource authorization before evidence queries', () => {
  assert.match(page, /const user = await requireUser\(\)/)
  assert.match(page, /canViewExecutionRun\(user\.id, run as AgentRun\)/)
  assert.match(page, /if \(!await canViewExecutionRun[^\n]+\) notFound\(\)/)
  const guard = page.indexOf('canViewExecutionRun(user.id, run as AgentRun)')
  const steps = page.indexOf("from('agent_run_steps')")
  assert.ok(guard >= 0 && steps > guard, 'resource authorization must run before step/log/message/artifact queries')
})

test('dataset-backed run visibility is delegated to DENY-aware resource ACL', () => {
  assert.match(resource, /if \(run\.dataset_id\) return canViewDatasetResource\(userId, run\.dataset_id\)/)
  assert.match(resource, /rpc\('can_view_dataset_resource'/)
})

test('unauthorized direct run detail does not disclose run existence', () => {
  assert.match(page, /if \(!run\) notFound\(\)/)
  assert.match(page, /if \(!await canViewExecutionRun[^\n]+\) notFound\(\)/)
})

const evaluation = fs.readFileSync(new URL('../app/api/agents/runs/[runId]/evaluation/route.ts', import.meta.url), 'utf8')

test('run evaluation GET and POST preserve execute capability while enforcing dataset ACL', () => {
  assert.match(evaluation, /select\('id,project_id,dataset_id'\)/)
  assert.match(evaluation, /select\('id,project_id,dataset_id,status,agent_definition_id'\)/)
  assert.equal((evaluation.match(/authorizeAgentAction\(/g) ?? []).length, 2)
  assert.equal((evaluation.match(/'agent\.execute'/g) ?? []).length, 2)
  assert.match(evaluation, /type: 'DATASET'.*datasetId: run\.dataset_id/s)
  assert.doesNotMatch(evaluation, /authorizeProject\(user\.id, run\.project_id, 'agent\.execute'\)/)
})
