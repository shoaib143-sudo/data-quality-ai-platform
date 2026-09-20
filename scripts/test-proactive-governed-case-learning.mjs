import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const {
  PGCL_ADMIN_DECISIONS,
  buildProactiveGovernedCaseLearningCandidate,
} = await import('../lib/agents/proactive-governed-case-learning.ts')

const base = {
  projectId: 'project-1',
  agentRunId: 'run-1',
  agentKey: 'data_quality_agent',
  skillKey: 'quality_rule_analysis',
  runMode: 'HANDSFREE',
  executionSucceeded: true,
  verificationSucceeded: true,
  useCaseKey: 'dq-missingness-threshold',
  problemSignature: 'customer.email completeness below governed threshold',
  resultSummary: 'Governed metadata action completed and verification passed',
  reusableLesson: 'Use the verified evidence bundle before proposing the same governed action',
  applicabilityConditions: ['same domain', 'same governed asset class'],
  exclusionConditions: ['source data mutation required'],
  evidenceRefs: ['evidence-b', 'evidence-a', 'evidence-a'],
  verificationEvidenceRefs: ['verify-2', 'verify-1'],
  significanceSignals: ['NEW_USE_CASE', 'HIGH_VALUE_GOVERNANCE_PRECEDENT'],
}

const candidate = buildProactiveGovernedCaseLearningCandidate(base)
assert.ok(candidate)
assert.equal(candidate.learningType, 'POSITIVE_CASE')
assert.equal(candidate.runMode, 'HANDSFREE')
assert.equal(candidate.requiresDataGovernanceAdminReview, true)
assert.equal(candidate.mayAutoPromote, false)
assert.equal(candidate.maySelfLearn, false)
assert.deepEqual(candidate.evidenceRefs, ['evidence-a', 'evidence-b'])
assert.deepEqual(candidate.verificationEvidenceRefs, ['verify-1', 'verify-2'])
assert.deepEqual(candidate.significanceSignals, ['HIGH_VALUE_GOVERNANCE_PRECEDENT', 'NEW_USE_CASE'])
assert.deepEqual(candidate.allowedAdminDecisions, PGCL_ADMIN_DECISIONS)
assert.ok(candidate.candidateKey.includes('positive-case:data_quality_agent:quality_rule_analysis'))

const repeated = buildProactiveGovernedCaseLearningCandidate({
  ...base,
  evidenceRefs: ['evidence-a', 'evidence-b'],
  significanceSignals: ['HIGH_VALUE_GOVERNANCE_PRECEDENT', 'NEW_USE_CASE'],
})
assert.equal(repeated?.candidateKey, candidate.candidateKey, 'candidate identity must be deterministic')

const supervised = buildProactiveGovernedCaseLearningCandidate({
  ...base,
  agentRunId: 'run-2',
  runMode: 'SUPERVISED',
})
assert.equal(supervised?.runMode, 'SUPERVISED')

assert.equal(buildProactiveGovernedCaseLearningCandidate({
  ...base,
  executionSucceeded: false,
}), null, 'failed executions must not become positive cases')

assert.equal(buildProactiveGovernedCaseLearningCandidate({
  ...base,
  verificationSucceeded: false,
}), null, 'unverified executions must not become positive cases')

assert.equal(buildProactiveGovernedCaseLearningCandidate({
  ...base,
  significanceSignals: [],
}), null, 'trivial successful executions must not notify the admin')

assert.throws(() => buildProactiveGovernedCaseLearningCandidate({
  ...base,
  evidenceRefs: [],
}), /evidenceRefs requires at least one value/)

assert.throws(() => buildProactiveGovernedCaseLearningCandidate({
  ...base,
  verificationEvidenceRefs: [],
}), /verificationEvidenceRefs requires at least one value/)

assert.throws(() => buildProactiveGovernedCaseLearningCandidate({
  ...base,
  runMode: 'AUTONOMOUS',
}), /SUPERVISED or HANDSFREE/)

const source = fs.readFileSync('lib/agents/proactive-governed-case-learning.ts', 'utf8')
for (const invariant of [
  "requiresDataGovernanceAdminReview: true",
  "mayAutoPromote: false",
  "maySelfLearn: false",
  "APPROVE_POSITIVE_CASE",
  "APPROVE_WITH_EDITS",
  "MARK_ONE_OFF",
  "executionSucceeded",
  "verificationSucceeded",
]) {
  assert.ok(source.includes(invariant), `missing PGCL invariant: ${invariant}`)
}

assert.equal(/chain[-_ ]?of[-_ ]?thought/i.test(source), false)
assert.equal(/hidden[-_ ]?reasoning/i.test(source), false)

console.log('PGCL proposes only verified, significant supervised/handsfree successes and requires Data Governance Admin review before learning.')
