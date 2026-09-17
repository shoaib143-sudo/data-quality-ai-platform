import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { evaluateAgentSkillOutcome } = await import('../lib/agents/agent-skill-outcome-evaluator.ts')
const {
  agentSkillCapabilityKey,
  readAgentSkillScorecard,
  recordAgentSkillOutcomeEvaluation,
} = await import('../lib/agents/agent-skill-evaluation.ts')
const source = fs.readFileSync('lib/agents/agent-skill-evaluation.ts', 'utf8')
const evaluationSource = fs.readFileSync('lib/ai/evaluation-engine.ts', 'utf8')

for (const required of [
  'assertAgentSkillEvaluationAllowed',
  'recordAgentSkillEvaluation',
  'recordAgentSkillOutcomeEvaluation',
  'readAgentSkillScorecard',
  'agentSkillCapabilityKey',
  "evaluationType: 'AGENT_SKILL'",
  'capability: agentSkillCapabilityKey(input.agentKey, input.skillKey)',
  'metricName: input.dimension',
  'agent_key: input.agentKey',
  'skill_key: input.skillKey',
  'evaluation_dimension: input.dimension',
  'skill.eligibleAgents.includes(agentKey)',
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
assert.equal(profileEvaluation.structuralPass, true)
assert.equal(profileEvaluation.overallPass, null, 'semantic correctness remains unknown without labeled evaluation')
assert.deepEqual(profileEvaluation.missingOutputFields, [])
assert.deepEqual(profileEvaluation.unauthorizedTools, [])
assert.equal(profileEvaluation.metrics.find((metric) => metric.dimension === 'completeness')?.score, 1)
assert.equal(profileEvaluation.metrics.find((metric) => metric.dimension === 'tool_correctness')?.pass, true)
assert.equal(profileEvaluation.metrics.find((metric) => metric.dimension === 'correctness')?.pass, null)

const incompleteProfile = evaluateAgentSkillOutcome({
  agentKey: 'profiling_agent',
  skillKey: 'profile_evidence_analysis',
  output: { observations: ['only partial output'] },
  evidenceRefs: [],
  invokedTools: ['profiling.source.read'],
})
assert.equal(incompleteProfile.structuralPass, false)
assert.equal(incompleteProfile.overallPass, false)
assert.ok(incompleteProfile.missingOutputFields.includes('evidence_refs'))
assert.equal(incompleteProfile.metrics.find((metric) => metric.dimension === 'evidence_sufficiency')?.pass, false)
assert.equal(incompleteProfile.metrics.find((metric) => metric.dimension === 'tool_correctness')?.pass, false)

const blankEvidence = evaluateAgentSkillOutcome({
  agentKey: 'profiling_agent',
  skillKey: 'profile_evidence_analysis',
  output: {
    observations: [],
    evidence_refs: [],
    confidence: null,
    confidenceBasis: 'insufficient evidence',
    limitations: ['no authoritative evidence'],
  },
  evidenceRefs: ['   ', '\t'],
  invokedTools: [' profiling.source.read ', 'profiling.schema.discover', 'profiling.metrics.execute'],
})
assert.equal(blankEvidence.metrics.find((metric) => metric.dimension === 'evidence_sufficiency')?.pass, false)
assert.equal(blankEvidence.metrics.find((metric) => metric.dimension === 'grounding')?.pass, false)
assert.equal(blankEvidence.metrics.find((metric) => metric.dimension === 'tool_correctness')?.pass, true)
assert.deepEqual(blankEvidence.unauthorizedTools, [])

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
assert.equal(investigatorEvaluation.structuralPass, true)
assert.equal(investigatorEvaluation.overallPass, null)
assert.equal(investigatorEvaluation.metrics.find((metric) => metric.dimension === 'confidence_calibration')?.pass, true)
assert.equal(investigatorEvaluation.metrics.find((metric) => metric.dimension === 'correctness')?.score, null)
assert.equal(investigatorEvaluation.metrics.find((metric) => metric.dimension === 'correctness')?.pass, null)
assert.equal(investigatorEvaluation.metrics.find((metric) => metric.dimension === 'handoff_quality')?.pass, null)

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
assert.equal(unauthorized.structuralPass, false)
assert.equal(unauthorized.overallPass, false)
assert.deepEqual(unauthorized.unauthorizedTools, ['quality.rules.execute'])
assert.equal(unauthorized.metrics.find((metric) => metric.dimension === 'authority_compliance')?.pass, false)

assert.throws(() => evaluateAgentSkillOutcome({
  agentKey: 'executive_agent',
  skillKey: 'quality_remediation_proposal',
  output: {},
}), /not authorized/)

const persisted = []
const scorecardRequests = []
const scorecardMetric = (request, overrides = {}) => ({
  evaluationType: 'AGENT_SKILL',
  capability: request.capability,
  metricName: 'grounding',
  sampleCount: 4,
  scoredCount: 4,
  passCount: 3,
  failCount: 1,
  averageScore: 0.75,
  evidenceResultIds: ['result-1'],
  lastObservedAt: '2026-09-18T00:00:00Z',
  ...overrides,
})
const fakeEngine = {
  id: 'test-evaluation-engine',
  async record(result) {
    persisted.push(result)
    return { resultId: `result-${persisted.length}`, persisted: true }
  },
  async scorecard(request) {
    scorecardRequests.push(request)
    return [scorecardMetric(request)]
  },
}

const recorded = await recordAgentSkillOutcomeEvaluation(fakeEngine, {
  projectId: 'project-1',
  agentKey: 'investigator_agent',
  skillKey: 'incident_root_cause_analysis',
  agentRunId: 'run-1',
  correlationId: 'corr-1',
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
assert.equal(recorded.receipts.length, recorded.evaluation.metrics.length)
assert.equal(persisted.length, recorded.evaluation.metrics.length)
assert.ok(persisted.every((row) => row.evaluationType === 'AGENT_SKILL'))
assert.ok(persisted.every((row) => row.capability === 'agent_skill:investigator_agent:incident_root_cause_analysis'))
assert.ok(persisted.every((row) => row.agentRunId === 'run-1'))
assert.ok(persisted.every((row) => row.correlationId === 'corr-1'))
assert.ok(persisted.every((row) => row.evaluatorType === 'DETERMINISTIC_SKILL_OUTCOME'))
assert.ok(persisted.every((row) => row.metadata.structural_pass === true))
assert.ok(persisted.some((row) => row.metricName === 'correctness' && row.pass === null && row.score === null))

assert.equal(
  agentSkillCapabilityKey('investigator_agent', 'incident_root_cause_analysis'),
  'agent_skill:investigator_agent:incident_root_cause_analysis',
)
assert.throws(
  () => agentSkillCapabilityKey('executive_agent', 'incident_root_cause_analysis'),
  /not authorized/,
)

const scorecard = await readAgentSkillScorecard(fakeEngine, {
  projectId: 'project-1',
  agentKey: 'investigator_agent',
  skillKey: 'incident_root_cause_analysis',
})
assert.deepEqual(scorecardRequests, [{
  projectId: 'project-1',
  evaluationType: 'AGENT_SKILL',
  capability: 'agent_skill:investigator_agent:incident_root_cause_analysis',
}])
assert.equal(scorecard.agentKey, 'investigator_agent')
assert.equal(scorecard.skillKey, 'incident_root_cause_analysis')
assert.deepEqual(scorecard.metrics.map((metric) => metric.metricName), ['grounding'])

for (const [overrides, expected] of [
  [{ evaluationType: 'OTHER' }, /unexpected evaluation type/],
  [{ capability: 'agent_skill:support_agent:support_case_investigation' }, /unexpected capability/],
  [{ metricName: 'cost' }, /out-of-contract metric/],
]) {
  const contaminatedEngine = {
    ...fakeEngine,
    async scorecard(request) {
      return [scorecardMetric(request, overrides)]
    },
  }
  await assert.rejects(() => readAgentSkillScorecard(contaminatedEngine, {
    projectId: 'project-1',
    agentKey: 'investigator_agent',
    skillKey: 'incident_root_cause_analysis',
  }), expected)
}

console.log('Skill-level evaluation rejects blank evidence and contaminated scorecards, normalizes identifiers, preserves unknown semantics, and records agent-scoped metrics.')
