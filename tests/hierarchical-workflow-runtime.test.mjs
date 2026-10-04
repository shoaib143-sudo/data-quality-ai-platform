import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync(new URL('../lib/orchestration/hierarchical-workflow.ts', import.meta.url), 'utf8')

test('hierarchical workflow extends the existing governed orchestrator contract', () => {
  assert.match(source, /validateExecutionPlan/)
  assert.match(source, /type OrchestratorNode/)
  assert.match(source, /GUIDED.*GOVERNED_AUTO.*FULL_AUTONOMOUS/)
})

test('workflow tasks separate deterministic, agent, approval, MCP and verification work', () => {
  for (const kind of ['DETERMINISTIC', 'AGENT', 'DECISION', 'APPROVAL', 'MCP', 'SERVICE', 'VERIFICATION', 'HUMAN', 'SUBWORKFLOW']) {
    assert.match(source, new RegExp(`'${kind}'`))
  }
})

test('workflow compiler fails closed on missing governed bindings and immutable input identity', () => {
  assert.match(source, /AGENT task requires agentKey/)
  assert.match(source, /MCP task requires mcpServerKey/)
  assert.match(source, /APPROVAL task requires approvalPolicyKey/)
  assert.match(source, /VERIFICATION task requires verificationPolicyKey/)
  assert.match(source, /immutable input hash is required before compilation/)
})

test('workflow definition is bounded before runtime execution', () => {
  assert.match(source, /maxTaskDepth/)
  assert.match(source, /maxTaskCount/)
  assert.match(source, /maxRuntimeMs/)
  assert.match(source, /Workflow exceeds maxTaskCount/)
  assert.match(source, /workflow dependency depth exceeds maxTaskDepth/)
})
