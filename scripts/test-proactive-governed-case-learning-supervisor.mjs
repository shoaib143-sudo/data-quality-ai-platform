import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { derivePgclCandidateFromVerifiedRun } = await import('../lib/agents/proactive-governed-case-learning-runtime.ts')

const run = {
  id: 'run-steward-1',
  project_id: 'project-1',
  status: 'SUCCEEDED',
  agent_definition_id: 'definition-1',
  input: { question: 'Find stewardship gaps for governed datasets.' },
  output: {
    specialist: { focus: 'stewardship_and_governance_completeness' },
    observations: ['Two governed datasets lack active steward assignments.'],
  },
}

const first = derivePgclCandidateFromVerifiedRun({
  run,
  agentKey: 'steward_agent',
  runMode: 'HANDSFREE',
  verificationEvidenceRefs: ['native_trajectory_evaluation:eval-1'],
  priorPositiveCaseExists: false,
})
assert.ok(first)
assert.equal(first.runMode, 'HANDSFREE')
assert.equal(first.skillKey, 'stewardship_gap_analysis')
assert.deepEqual(first.significanceSignals, ['NEW_USE_CASE'])
assert.equal(first.requiresDataGovernanceAdminReview, true)
assert.equal(first.mayAutoPromote, false)
assert.equal(first.maySelfLearn, false)
assert.match(first.useCaseKey, /^steward_agent:stewardship_gap_analysis:/)
assert.ok(first.exclusionConditions.includes('the future case requires source/business data mutation'))

const repeated = derivePgclCandidateFromVerifiedRun({
  run: { ...run, id: 'run-steward-2' },
  agentKey: 'steward_agent',
  runMode: 'SUPERVISED',
  verificationEvidenceRefs: ['native_trajectory_evaluation:eval-2'],
  priorPositiveCaseExists: true,
})
assert.ok(repeated)
assert.deepEqual(repeated.significanceSignals, ['REPEATED_SUCCESS_THRESHOLD'])
assert.equal(repeated.runMode, 'SUPERVISED')

assert.equal(derivePgclCandidateFromVerifiedRun({
  run: { ...run, status: 'FAILED' },
  agentKey: 'steward_agent',
  runMode: 'HANDSFREE',
  verificationEvidenceRefs: ['native_trajectory_evaluation:eval-failed'],
  priorPositiveCaseExists: false,
}), null)

assert.equal(derivePgclCandidateFromVerifiedRun({
  run,
  agentKey: 'steward_agent',
  runMode: 'HANDSFREE',
  verificationEvidenceRefs: [],
  priorPositiveCaseExists: false,
}), null, 'verified execution evidence is mandatory')

const remainingSpecialists = [
  ['architect_agent', 'lineage_impact_analysis'],
  ['investigator_agent', 'incident_root_cause_analysis'],
  ['executive_agent', 'executive_materiality_analysis'],
  ['support_agent', 'support_case_investigation'],
]

for (const [agentKey, expectedSkillKey] of remainingSpecialists) {
  const candidate = derivePgclCandidateFromVerifiedRun({
    run: { ...run, id: `run-${agentKey}` },
    agentKey,
    runMode: 'HANDSFREE',
    verificationEvidenceRefs: [`native_trajectory_evaluation:eval-${agentKey}`],
    priorPositiveCaseExists: false,
  })
  assert.ok(candidate, `PGCL candidate expected for ${agentKey}`)
  assert.equal(candidate.skillKey, expectedSkillKey)
  assert.equal(candidate.requiresDataGovernanceAdminReview, true)
  assert.equal(candidate.mayAutoPromote, false)
  assert.equal(candidate.maySelfLearn, false)
}

const runtime = fs.readFileSync('lib/agents/proactive-governed-case-learning-runtime.ts', 'utf8')
const supervisor = fs.readFileSync('lib/agents/runtime/native-supervisor-service.ts', 'utf8')
const route = fs.readFileSync('app/api/agents/supervisor/run/route.ts', 'utf8')

for (const invariant of [
  'proposePgclCasesFromVerifiedSupervisorRun',
  'persistProactiveGovernedCaseLearningCandidate',
  "run.status !== 'SUCCEEDED'",
  "REPEATED_SUCCESS_THRESHOLD",
  "NEW_USE_CASE",
  "architect_agent: 'lineage_impact_analysis'",
  "investigator_agent: 'incident_root_cause_analysis'",
  "executive_agent: 'executive_materiality_analysis'",
  "support_agent: 'support_case_investigation'",
  'native_trajectory_evaluation:',
]) {
  assert.ok(runtime.includes(invariant), 'missing PGCL supervisor runtime invariant: ' + invariant)
}

for (const invariant of [
  'proposePgclCasesFromVerifiedSupervisorRun({',
  "runMode: input.learningRunMode ?? 'HANDSFREE'",
  "status: 'FAILED'",
  'pgcl_evaluation: learningEvaluation',
]) {
  assert.ok(supervisor.includes(invariant), 'missing supervisor PGCL hook invariant: ' + invariant)
}

assert.ok(
  supervisor.indexOf('proposePgclCasesFromVerifiedSupervisorRun({') > supervisor.indexOf('evaluateNativeSupervisorTrajectory(supervisorRun.id)'),
  'PGCL proposal must run only after authoritative supervisor trajectory evaluation',
)
assert.ok(route.includes("learningRunMode: approvalRequestId ? 'SUPERVISED' : 'HANDSFREE'"))
assert.ok(route.includes('learningEvaluation: result.learningEvaluation ?? null'))

console.log('Verified supervisor success now evaluates priority-agent runs for Data Governance Admin-reviewed PGCL without granting learning authority.')
