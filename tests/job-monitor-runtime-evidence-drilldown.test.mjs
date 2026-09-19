import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const page = fs.readFileSync(new URL('../app/agents/runs/[runId]/page.tsx', import.meta.url), 'utf8')

test('run drilldown requires evidence capability after resource visibility', () => {
  const visibility = page.indexOf('canViewExecutionRun(user.id, run as AgentRun)')
  const evidence = page.indexOf("'execution.view_evidence'")
  const steps = page.indexOf("from('agent_run_steps')")
  assert.ok(visibility >= 0 && evidence > visibility && steps > evidence)
  assert.match(page, /authorizeAgentAction/)
  assert.match(page, /type: 'DATASET'.*datasetId: run\.dataset_id/s)
  assert.match(page, /catch \{\s*notFound\(\)\s*\}/)
})

test('run drilldown exposes hash-only governed runtime evidence', () => {
  for (const table of [
    'agent_tool_invocations',
    'agent_run_checkpoints',
    'agent_run_interrupts',
    'agent_supervisor_events',
  ]) assert.match(page, new RegExp(`from\\('${table}'\\)`))

  assert.match(page, /Governed tool invocations/)
  assert.match(page, /Runtime checkpoints/)
  assert.match(page, /Approval and runtime interrupts/)
  assert.match(page, /Supervisor trajectory/)
  assert.match(page, /contract_hash/)
  assert.match(page, /input_hash/)
  assert.match(page, /output_hash/)
})

test('runtime evidence projection excludes raw manifest and tool payloads', () => {
  assert.doesNotMatch(page, /agent_run_runtime_manifests/)
  assert.doesNotMatch(page, /tool_contracts/)
  assert.doesNotMatch(page, /agent_tool_invocations[^\n]+input,/)
  assert.doesNotMatch(page, /agent_tool_invocations[^\n]+output,/)
})
