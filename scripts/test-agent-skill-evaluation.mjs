import assert from 'node:assert/strict'
import fs from 'node:fs'

const { evaluateAgentSkillOutcome } = await import('../lib/agents/agent-skill-outcome-evaluator.ts')
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

const profileEvaluation = evaluateAgentSkillOutcome({
  agentKey: 'profiling_agent',
  skillKey: 'profile_evidence_analysis',
  output: {
    observations: ['null rate increased'],
    evidence_refs: ['metric-1'],
    confidence: 0.88,
    limitations: ['sampled data'],
  },
  evidenceRefs: ['metric-1'],
  invokedTools: ['profiling.source.read', 'profiling.schema.discover', 'profiling.metrics.execute'],
})
assert.equal(profileEvaluation.overallPass, true)
assert.deepEqual(profileEvaluation.missingOutputFields, [])
assert.deepEqual(profileEvaluation.unauthorizedTools, [])
assert.equal(profileEvaluation.metrics.find((metric) => metric.dimension === 'completeness')?.score, 1)
assert.equal(profileEvaluation.metrics.find((metric) => metric.dimension === 'tool_correctness')?.pass, true)

const incompleteProfile = evaluateAgentSkillOutcome({
  agentKey: 'profiling_agent',
  skillKey: 'profile_evidence_analysis',
  output: { observations: ['only partial output'] },
  evidenceRefs: [],
  invokedTools: ['profiling.source.read'],
})
assert.equal(incompleteProfile.overallPass, false)
assert.ok(incompleteProfile.missingOutputFields.includes('evidence_refs'))
assert.equal(incompleteProfile.metrics.find((metric) => metric.dimension === 'evidence_sufficiency')?.pass, false)
assert.equal(incompleteProfile.metrics.find((metric) => metric.dimension === 'tool_correctness')?.pass, false)

const investigatorEvaluation = evaluateAgentSkillOutcome({
  agentKey: 'investigator_agent',
  skillKey: 'incident_root_cause_analysis',
  output: {
    hypotheses: [{ hypothesis: 'same-dataset freshness breach' }],
    probable_causes: [],
    alternative_causes: [],
    confidence: null,
    confidenceBasis: 'No calibrated probability is asserted; deterministic evidence strength is HIGH.',
    evidence_refs: ['incident-1', 'alert-1'],
    recommended_follow_up: ['compare timestamps'],
  },
  evidenceRefs: ['incident-1', 'alert-1'],
  invokedTools: [
    'quality.incident.read',
    'quality.history.read',
    'profiling.history.read',
    'lineage.read',
    'governance.issue.read',
    'remediation.history.read',
  ],
})
assert.equal(investigatorEvaluation.overallPass, true)
assert.equal(investigatorEvaluation.metrics.find((metric) => metric.dimension === 'confidence_calibration')?.pass, true)
assert.equal(investigatorEvaluation.metrics.find((metric) => metric.dimension === 'correctness')?.score, null)

const unauthorized = evaluateAgentSkillOutcome({
  agentKey: 'support_agent',
  skillKey: 'support_case_investigation',
  output: {
    diagnosis: 'known run failure',
    safe_next_actions: ['inspect run'],
    evidence_refs: ['run-1'],
    handoff_recommendation: 'investigator_agent',
    confidenceBasis: 'evidence-backed',
  },
  evidenceRefs: ['run-1'],
  invokedTools: ['profiling.history.read', 'quality.incident.read', 'governance.issue.read', 'remediation.history.read', 'quality.rules.execute'],
})
assert.equal(unauthorized.overallPass, false)
assert.deepEqual(unauthorized.unauthorizedTools, ['quality.rules.execute'])
assert.equal(unauthorized.metrics.find((metric) => metric.dimension === 'authority_compliance')?.pass, false)

assert.throws(() => evaluateAgentSkillOutcome({
  agentKey: 'executive_agent',
  skillKey: 'quality_remediation_proposal',
  output: {},
}), /not authorized/)

console.log('Skill-level evaluation bridge, deterministic structural outcome evaluator, authority checks, and privacy-safe evidence dimensions verified.')
