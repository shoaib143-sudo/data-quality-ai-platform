import assert from 'node:assert/strict'
import fs from 'node:fs'

const source = fs.readFileSync('lib/agents/agent-skill-evaluation.ts', 'utf8')
const evaluationSource = fs.readFileSync('lib/ai/evaluation-engine.ts', 'utf8')

for (const required of [
  'assertAgentSkillEvaluationAllowed',
  'recordAgentSkillEvaluation',
  "evaluationType: 'AGENT_SKILL'",
  'capability: `agent_skill:${input.skillKey}`',
  'metricName: input.dimension',
  'agent_key: input.agentKey',
  'skill_key: input.skillKey',
  'evaluation_dimension: input.dimension',
  'skill.eligibleAgents.includes(input.agentKey)',
  'contract.requiredEvaluationDimensions.includes(input.dimension)',
]) {
  assert.ok(source.includes(required), `missing agent skill evaluation invariant: ${required}`)
}

for (const required of [
  'capability?: string | null',
  'metricName: string',
  'agentRunId?: string | null',
  'correlationId?: string | null',
  'evidenceRefs?: string[]',
]) {
  assert.ok(evaluationSource.includes(required), `evaluation engine does not expose required skill evaluation field: ${required}`)
}

assert.equal(source.includes('prompt'), false, 'skill evaluation bridge must not persist prompts')
assert.equal(source.includes('reasoning:'), false, 'skill evaluation bridge must not persist hidden reasoning')

console.log('Skill-level evaluation bridge, authorization checks, and privacy-safe evidence dimensions verified.')
