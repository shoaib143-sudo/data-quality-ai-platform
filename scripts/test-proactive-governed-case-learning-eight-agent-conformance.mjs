import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const {
  PGCL_AGENT_DEFAULT_SKILL,
  derivePgclCandidateFromVerifiedRun,
} = await import('../lib/agents/proactive-governed-case-learning.ts')
const { GOVERNED_AGENT_KEYS } = await import('../lib/agents/governed-agent-registry.ts')

const expectedSkills = {
  profiling_agent: 'profile_evidence_analysis',
  data_quality_agent: 'quality_rule_analysis',
  steward_agent: 'stewardship_gap_analysis',
  governance_analyst_agent: 'governance_evidence_synthesis',
  architect_agent: 'lineage_impact_analysis',
  investigator_agent: 'incident_root_cause_analysis',
  executive_agent: 'executive_materiality_analysis',
  support_agent: 'support_case_investigation',
}

assert.deepEqual([...GOVERNED_AGENT_KEYS], Object.keys(expectedSkills))
assert.deepEqual(PGCL_AGENT_DEFAULT_SKILL, expectedSkills)

for (const agentKey of GOVERNED_AGENT_KEYS) {
  const candidate = derivePgclCandidateFromVerifiedRun({
    run: {
      id: `run-${agentKey}`,
      project_id: 'project-1',
      status: 'SUCCEEDED',
      agent_definition_id: `definition-${agentKey}`,
      input: { question: `verified use case for ${agentKey}` },
      output: {
        focus: `verified-${agentKey}-focus`,
        observations: [`${agentKey} completed a governed verified case`],
      },
    },
    agentKey,
    runMode: agentKey === 'profiling_agent' ? 'SUPERVISED' : 'HANDSFREE',
    verificationEvidenceRefs: [`verification:${agentKey}`],
    priorPositiveCaseExists: false,
  })

  assert.ok(candidate, `${agentKey} must be eligible to emit a governed positive-case candidate`)
  assert.equal(candidate.agentKey, agentKey)
  assert.equal(candidate.skillKey, expectedSkills[agentKey])
  assert.equal(candidate.requiresDataGovernanceAdminReview, true)
  assert.equal(candidate.mayAutoPromote, false)
  assert.equal(candidate.maySelfLearn, false)
  assert.ok(candidate.verificationEvidenceRefs.includes(`verification:${agentKey}`))
  assert.ok(candidate.candidateKey.includes(`positive-case:${agentKey}:${expectedSkills[agentKey]}`))
}

const runtime = fs.readFileSync('lib/agents/proactive-governed-case-learning-runtime.ts', 'utf8')
for (const invariant of [
  'isGovernedAgentKey',
  'derivePgclCandidateFromVerifiedRun',
  'proposePgclCaseFromVerifiedAgentRun',
  'proposePgclCasesFromVerifiedSupervisorRun',
  'persistProactiveGovernedCaseLearningCandidate',
]) {
  assert.ok(runtime.includes(invariant), `missing shared PGCL runtime invariant: ${invariant}`)
}
for (const agentKey of GOVERNED_AGENT_KEYS) {
  assert.equal(
    runtime.includes(`if (rawAgentKey === '${agentKey}')`),
    false,
    `PGCL runtime must not special-case ${agentKey}; all canonical agents use the common governed path`,
  )
}

const governanceRoute = fs.readFileSync('app/api/agents/governance/run/route.ts', 'utf8')
for (const invariant of [
  'proposePgclCaseFromVerifiedAgentRun',
  'positiveLearningCases: approvedPositiveCases',
  'approved_positive_case_count: approvedPositiveCases.length',
  'recordAgentLearningInfluenceOutcome',
]) {
  assert.ok(governanceRoute.includes(invariant), `missing governance-specialist PGCL integration: ${invariant}`)
}

const specialist = fs.readFileSync('lib/agents/governance-specialist-agent.ts', 'utf8')
for (const agentKey of [
  'steward_agent',
  'governance_analyst_agent',
  'architect_agent',
  'investigator_agent',
  'executive_agent',
  'support_agent',
]) {
  assert.ok(specialist.includes(`${agentKey}:`), `missing specialist reasoning contract for ${agentKey}`)
}
for (const invariant of [
  'positiveLearningCases',
  'learnedPositiveCases',
  'appliedPositiveCaseIds',
  'CONTEXT_ONLY_REQUIRES_CURRENT_POLICY',
  'Data Governance Admin-approved positive cases are historical precedent only',
]) {
  assert.ok(specialist.includes(invariant), `missing specialist learning-context boundary: ${invariant}`)
}

const supervisor = fs.readFileSync('lib/agents/runtime/native-supervisor-service.ts', 'utf8')
for (const invariant of [
  'proposePgclCasesFromVerifiedSupervisorRun',
  'childRunIds',
  'supervisorEvaluationId',
]) {
  assert.ok(supervisor.includes(invariant), `missing supervisor PGCL integration: ${invariant}`)
}

const profilingJob = fs.readFileSync('lib/agents/run-profiling-job.ts', 'utf8')
assert.ok(profilingJob.includes('proposePgclCaseFromVerifiedAgentRun'))
const dqWorker = fs.readFileSync('lib/orchestration/worker.ts', 'utf8')
assert.ok(dqWorker.includes('proposePgclCaseFromVerifiedAgentRun'))

console.log('All eight canonical agents share the same governed positive-case learning contract, retain current-policy authority boundaries, and have certified execution-surface integration.')
