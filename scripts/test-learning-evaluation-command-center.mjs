import assert from 'node:assert/strict'
import fs from 'node:fs'

const state = fs.readFileSync('lib/ai/learning-evaluation-command-center-state.ts', 'utf8')
const page = fs.readFileSync('app/admin/ai-command-center/learning-governance/page.tsx', 'utf8')

for (const invariant of [
  "authorizeProject(actorUserId, projectId, 'admin.manage')",
  "from('learning_evaluation_policies')",
  "from('learning_evaluation_results')",
  'automaticPromotionAllowed: false',
  'humanReleaseReviewRequired: true',
  'readOnly: true',
  'gainLowerConfidenceBound',
  'authorityViolations',
  'safetyFailures',
  'accountingComplete',
]) assert.ok(state.includes(invariant), `missing evaluation observability invariant: ${invariant}`)

for (const forbidden of [
  '.insert(',
  '.update(',
  '.delete(',
  '.upsert(',
  '.rpc(',
  'requestGovernedLearningCandidateReleaseApproval',
  'startGovernedLearningCanary',
  'activateGovernedLearningCandidate',
  'rollbackGovernedLearningCandidate',
]) assert.equal(state.includes(forbidden), false, `evaluation Command Center must remain read-only: ${forbidden}`)

for (const invariant of [
  'readLearningEvaluationCommandCenterState',
  'Prospective evaluation decisions',
  'evaluation.counts.improved',
  'evaluation.counts.regressed',
  'evaluation.counts.inconclusive',
  'evaluation.counts.stopped',
  'evaluation.counts.rejected',
  'evaluation.authority.automaticPromotionAllowed',
  'evaluation.authority.humanReleaseReviewRequired',
  'decision.gainLowerConfidenceBound',
  'decision.authorityViolations',
  'decision.safetyFailures',
  'decision.accountingComplete',
  'No prospective evaluation decisions are recorded',
]) assert.ok(page.includes(invariant), `missing evaluation UI invariant: ${invariant}`)

for (const forbidden of [
  'requestGovernedLearningCandidateReleaseApproval',
  'approveGovernedLearningCandidateForControlledRelease',
  'startGovernedLearningCanary',
  'activateGovernedLearningCandidate',
  'rollbackGovernedLearningCandidate',
]) assert.equal(page.includes(forbidden), false, `learning governance UI must not expose mutation authority: ${forbidden}`)

console.log('Learning Governance exposes locked prospective evaluation decisions as read-only release-admission evidence.')
