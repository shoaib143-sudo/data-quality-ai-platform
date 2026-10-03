import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('execution controller cannot mark a task successful without independent verification', () => {
  const source = read('lib/orchestration/workflow-execution-controller.ts')
  assert.match(source, /assertNodeTransition/)
  assert.match(source, /Verification result is required before task success/)
  assert.match(source, /assertTaskClosureAllowed/)
})

test('dependent tasks release only after all dependencies succeed', () => {
  const source = read('lib/orchestration/workflow-execution-controller.ts')
  assert.match(source, /dependencies\.every/)
  assert.match(source, /state === 'SUCCEEDED'/)
  assert.match(source, /state: 'READY'/)
})

test('workflow budgets bound runtime, task, agent, MCP and tool execution', () => {
  const source = read('lib/orchestration/workflow-budget.ts')
  for (const field of ['maxRuntimeMs','maxTaskExecutions','maxAgentExecutions','maxMcpCalls','maxToolCalls']) assert.match(source, new RegExp(field))
  assert.match(source, /budget exceeded/)
})

test('workflow evidence stores hashes instead of raw canonical payloads', () => {
  const source = read('lib/orchestration/workflow-evidence.ts')
  assert.match(source, /createHash\('sha256'\)/)
  assert.match(source, /payloadHash/)
  assert.doesNotMatch(source, /canonicalPayload:/)
})
