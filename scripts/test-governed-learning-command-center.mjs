import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const stateSource = fs.readFileSync('lib/ai/governed-learning-command-center-state.ts', 'utf8')
for (const invariant of [
  "from('learning_candidates')",
  "from('learning_candidate_benchmarks')",
  "from('learning_candidate_approval_links')",
  "from('learning_candidate_releases')",
  "from('learning_candidate_transitions')",
  "from('learning_candidate_canary_evidence')",
  'transitionCount',
  'latestTransition',
  'canaryEvidenceCount',
  'canaryPassCount',
  'canaryFailureCount',
  'canaryAverageScore',
  'transitionEvents',
  'canaryEvidenceEvents',
  'selfPromotionAllowed: false',
  'automaticAuthorityExpansionAllowed: false',
  'automaticMutationBoundaryChangeAllowed: false',
  'humanReviewRequired: true',
  'currentAuthorizationRequiredAtRelease: true',
]) {
  assert.ok(stateSource.includes(invariant), `missing governed learning command-center invariant: ${invariant}`)
}

for (const forbidden of [
  '.insert(',
  '.update(',
  '.delete(',
  '.rpc(',
  'approve_learning_candidate',
  'activate_learning_candidate',
  'rollback_learning_candidate',
]) {
  assert.equal(
    stateSource.includes(forbidden),
    false,
    `learning lifecycle Command Center must remain read-only: ${forbidden}`,
  )
}

const page = fs.readFileSync('app/admin/ai-command-center/page.tsx', 'utf8')
for (const invariant of [
  'readGovernedLearningLifecycleCommandCenter',
  'Governed learning lifecycle',
  'Self-promotion:',
  'Authority expansion:',
  'Mutation expansion:',
  'Human review:',
  'Release authorization:',
  'candidate.benchmarkStatus',
  'candidate.approvalRequestId',
  'candidate.releaseStatus',
]) {
  assert.ok(page.includes(invariant), `missing learning lifecycle UI invariant: ${invariant}`)
}

assert.equal(
  page.includes('startGovernedLearningCanary'),
  false,
  'AI Command Center must not expose learning canary mutation actions',
)
assert.equal(
  page.includes('activateGovernedLearningCandidate'),
  false,
  'AI Command Center must not expose learning activation actions',
)
assert.equal(
  page.includes('rollbackGovernedLearningCandidate'),
  false,
  'AI Command Center must not expose learning rollback actions',
)


const learningPage = fs.readFileSync('app/admin/ai-command-center/learning-governance/page.tsx', 'utf8')
for (const invariant of [
  'Transition evidence',
  'Canary evidence',
  'lifecycle.counts.transitionEvents',
  'lifecycle.counts.canaryEvidenceEvents',
  'candidate.transitionCount',
  'candidate.latestTransition',
  'candidate.canaryEvidenceCount',
  'candidate.canaryPassCount',
  'candidate.canaryFailureCount',
  'candidate.canaryAverageScore',
]) {
  assert.ok(learningPage.includes(invariant), `missing learning lifecycle evidence UI invariant: ${invariant}`)
}

console.log('AI Command Center exposes the complete governed learning lifecycle as read-only evidence without promotion authority.')
