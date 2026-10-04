import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('workflow run identity is correlated and definition hashed', () => {
  const source = read('lib/orchestration/workflow-run-identity.ts')
  assert.match(source, /randomUUID/)
  assert.match(source, /createHash\('sha256'\)/)
  assert.match(source, /definitionHash/)
})

test('approval binding rejects stale task input and policy', () => {
  const source = read('lib/orchestration/workflow-approval-binding.ts')
  assert.match(source, /exactInputHash/)
  assert.match(source, /input changed while approval was pending/)
  assert.match(source, /policy changed while approval was pending/)
})

test('MCP provider exposes only governed capability binding and correlation identity', () => {
  const source = read('lib/orchestration/mcp-capability-provider.ts')
  assert.match(source, /kind: 'MCP'/)
  assert.match(source, /correlationId/)
  assert.doesNotMatch(source, /password|secret|token/i)
})

test('monitoring projection derives graph from compiled runtime plan', () => {
  const source = read('lib/orchestration/workflow-monitoring-projection.ts')
  assert.match(source, /CompiledWorkflowPlan/)
  assert.match(source, /dependencies/)
  assert.match(source, /edges/)
})
