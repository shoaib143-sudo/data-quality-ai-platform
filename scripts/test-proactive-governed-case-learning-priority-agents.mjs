import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { derivePgclCandidateFromVerifiedRun } = await import('../lib/agents/proactive-governed-case-learning.ts')

const profiling = derivePgclCandidateFromVerifiedRun({
  run: {
    id: 'profiling-run-1',
    project_id: 'project-1',
    status: 'SUCCEEDED',
    agent_definition_id: 'profiling-definition',
    input: { datasetVersionId: 'version-1' },
    output: { focus: 'profiling_evidence_analysis', execution_completed: true },
  },
  agentKey: 'profiling_agent',
  runMode: 'SUPERVISED',
  verificationEvidenceRefs: ['profile_run:profile-1:validated'],
  priorPositiveCaseExists: false,
})
assert.ok(profiling)
assert.equal(profiling.skillKey, 'profile_evidence_analysis')
assert.equal(profiling.runMode, 'SUPERVISED')

const dataQuality = derivePgclCandidateFromVerifiedRun({
  run: {
    id: 'dq-run-1',
    project_id: 'project-1',
    status: 'SUCCEEDED',
    agent_definition_id: 'dq-definition',
    input: { datasetVersionId: 'version-1', profileRunId: 'profile-1' },
    output: { focus: 'quality_rule_analysis', execution_completed: true, rules_total: 5, rules_failed: 1 },
  },
  agentKey: 'data_quality_agent',
  runMode: 'HANDSFREE',
  verificationEvidenceRefs: ['agent_run:dq-run-1:succeeded', 'profile_run:profile-1'],
  priorPositiveCaseExists: false,
})
assert.ok(dataQuality)
assert.equal(dataQuality.skillKey, 'quality_rule_analysis')
assert.equal(dataQuality.runMode, 'HANDSFREE')

const profilingRoute = fs.readFileSync('app/api/agents/run/route.ts', 'utf8')
const profilingJob = fs.readFileSync('lib/agents/run-profiling-job.ts', 'utf8')
const qualityQueue = fs.readFileSync('lib/data-quality/queue.ts', 'utf8')
const qualityAutomation = fs.readFileSync('lib/data-quality/automation.ts', 'utf8')
const worker = fs.readFileSync('lib/orchestration/worker.ts', 'utf8')

for (const invariant of [
  "learningRunMode: 'SUPERVISED'",
  "requestInput: { ...requestInput, learningRunMode: 'SUPERVISED' }",
]) {
  assert.ok(profilingRoute.includes(invariant), 'missing Profiling PGCL mode invariant: ' + invariant)
}

for (const invariant of [
  'proposePgclCaseFromVerifiedAgentRun',
  "focus: 'profiling_evidence_analysis'",
  "focus: 'profiling_evidence_reuse'",
  'profile_run:',
  'agent_result_artifact:',
  'PGCL evaluation failed without changing profiling success',
]) {
  assert.ok(profilingJob.includes(invariant), 'missing Profiling PGCL completion invariant: ' + invariant)
}

assert.ok(qualityQueue.includes("learningRunMode: input.requestedByUser ? 'SUPERVISED' : 'HANDSFREE'"))
assert.ok(qualityAutomation.includes("focus: 'quality_rule_analysis'"))

for (const invariant of [
  'proposePgclCaseFromVerifiedAgentRun',
  "text(payload.learningRunMode) === 'SUPERVISED' ? 'SUPERVISED' : 'HANDSFREE'",
  'agent_run:',
  'profile_run:',
  'PGCL evaluation failed without changing data-quality success',
]) {
  assert.ok(worker.includes(invariant), 'missing Data Quality PGCL completion invariant: ' + invariant)
}

assert.ok(
  worker.indexOf('proposePgclCaseFromVerifiedAgentRun({') > worker.indexOf('await correlateIncidentProject({ incident, userId: userId || null })'),
  'Data Quality PGCL evaluation must run only after the governed quality execution and downstream evidence path completes',
)

console.log('Profiling and Data Quality PGCL derivation remain dependency-free and wired at their successful completion boundaries.')
