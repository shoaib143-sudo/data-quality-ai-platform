import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { GOVERNANCE_READ_AGENT_KEYS } = await import('../lib/agents/governance-read-agent.ts')
const {
  buildGovernanceSpecialistSkillEvaluationInput,
  governedSpecialistPrimarySkill,
} = await import('../lib/agents/governance-specialist-skill-evaluation.ts')
const { evaluateAgentSkillOutcome } = await import('../lib/agents/agent-skill-outcome-evaluator.ts')
const { getGovernedSkill } = await import('../lib/agents/governed-skill-registry.ts')

const runtimeOutput = {
  observations: [{ observation: 'bounded observation' }],
  recommendations: [{ recommendation: 'bounded recommendation' }],
  hypotheses: [{ hypothesis: 'bounded hypothesis' }],
  priorities: [{ priority: 'HIGH' }],
  limitations: ['bounded uncertainty'],
  confidence: 0.9,
  approval_status: 'NOT_APPLICABLE_READ_ONLY',
  knowledge: { graph: { edges: [{ from: 'a', to: 'b' }] } },
  investigation: {
    probableCauses: [{ cause: 'evidence-backed cause' }],
    alternativeCauses: [{ cause: 'bounded alternative' }],
  },
}

assert.deepEqual([...GOVERNANCE_READ_AGENT_KEYS].sort(), [
  'architect_agent',
  'executive_agent',
  'governance_analyst_agent',
  'investigator_agent',
  'steward_agent',
  'support_agent',
])

for (const agentKey of GOVERNANCE_READ_AGENT_KEYS) {
  const skillKey = governedSpecialistPrimarySkill(agentKey)
  const input = buildGovernanceSpecialistSkillEvaluationInput({
    agentKey,
    nativeToolInvocationId: `invocation-${agentKey}`,
    output: runtimeOutput,
  })

  assert.equal(input.skillKey, skillKey)
  assert.deepEqual(input.invokedTools, ['governance_specialist_investigate'])
  assert.deepEqual(input.authorityViolations, [])
  assert.deepEqual(input.evidenceRefs, [`native_tool_invocation:invocation-${agentKey}`])

  const skill = getGovernedSkill(skillKey)
  assert.deepEqual(
    skill.requiredToolsByAgent[agentKey],
    ['governance_specialist_investigate'],
    `${agentKey} primary skill must evaluate the native tool actually executed`,
  )

  const evaluation = evaluateAgentSkillOutcome({
    agentKey,
    skillKey,
    output: input.output,
    evidenceRefs: input.evidenceRefs,
    invokedTools: input.invokedTools,
    authorityViolations: input.authorityViolations,
  })
  assert.equal(evaluation.structuralPass, true, `${agentKey} runtime output must pass measurable structural skill checks`)
  assert.equal(
    evaluation.metrics.some((metric) => metric.pass === false),
    false,
    `${agentKey} runtime evidence must not create a false failure from logical tools that were not invoked`,
  )
}

const runtime = fs.readFileSync('lib/agents/governance-specialist-agent.ts', 'utf8')
assert.match(runtime, /evaluateGovernanceSpecialistSkill/)
assert.match(runtime, /skillEvaluationStatus: 'RECORDED' \| 'UNAVAILABLE'/)
assert.match(runtime, /skill_evaluation_status: skillEvaluationStatus/)
assert.match(runtime, /skill_evaluation_result_ids: skillEvaluationResultIds/)
const finishAt = runtime.indexOf('lifecycleFinished = true')
const evaluationAt = runtime.indexOf('evaluateGovernanceSpecialistSkill')
const auditAt = runtime.indexOf("eventType: 'GOVERNANCE_SPECIALIST_AGENT_COMPLETED'")
assert.ok(finishAt >= 0 && evaluationAt > finishAt, 'skill evaluation must run only after native lifecycle success')
assert.ok(auditAt > evaluationAt, 'governance audit must report persisted or unavailable evaluation state')

const evaluator = fs.readFileSync('lib/agents/governance-specialist-skill-evaluation.ts', 'utf8')
assert.match(evaluator, /learning_candidate_authority: false/)
assert.match(evaluator, /production_mutation_authority: false/)
assert.doesNotMatch(evaluator, /SELF_PROMOTE|APPROVED_FOR_CONTROLLED_RELEASE|transition_learning_candidate/)

console.log('All six governed specialist agents emit runtime-grounded skill evaluation evidence without gaining learning or mutation authority.')
