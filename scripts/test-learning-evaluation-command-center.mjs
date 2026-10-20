import assert from 'node:assert/strict'
import fs from 'node:fs'
import { registerHooks } from 'node:module'
import { setResponses } from './fixtures/learning-evaluation-admin.mjs'

const state = fs.readFileSync('lib/ai/learning-evaluation-command-center-state.ts', 'utf8')
const page = fs.readFileSync('app/admin/ai-command-center/learning-governance/page.tsx', 'utf8')

for (const invariant of [
  "authorizeProject(actorUserId, projectId, 'admin.manage')",
  "from('learning_evaluation_policies')",
  "from('learning_evaluation_results')",
  'automaticPromotionAllowed: false',
  'humanReleaseReviewRequired: true',
  "attestationStatus: 'UNATTESTED'",
  "row.attestationStatus === 'ATTESTED'",
  'readOnly: true',
  'datasetManifestId',
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
  'UNATTESTED_IMPROVEMENT',
  'Evidence attestation:',
  'evaluation.counts.regressed',
  'evaluation.counts.inconclusive',
  'evaluation.counts.stopped',
  'evaluation.counts.rejected',
  'evaluation.authority.automaticPromotionAllowed',
  'evaluation.authority.humanReleaseReviewRequired',
  'policy?.datasetManifestId',
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

const adminMock = new URL('./fixtures/learning-evaluation-admin.mjs', import.meta.url).href
const authMock = new URL('./fixtures/learning-evaluation-command-center-auth.mjs', import.meta.url).href
registerHooks({ resolve(specifier, context, next) {
  if (specifier === '@/lib/supabase/admin') return next(adminMock, context)
  if (specifier === '@/lib/auth/authorize') return next(authMock, context)
  return next(specifier, context)
} })
const { readLearningEvaluationCommandCenterState } = await import('../lib/ai/learning-evaluation-command-center-state.ts')
const scopedPolicy = { id: 'policy-1', candidate_id: 'candidate-1', dataset_manifest_id: 'manifest-1', policy_key: 'policy',
  agent_key: 'profiling_agent', skill_key: 'profile_evidence_analysis', mode: 'GUIDED', manifest_hash: 'sha256:manifest',
  evaluator_actor_id: 'reviewer-1', locked_at: '2026-10-01T00:00:00.000Z', sample_size: 2, minimum_gain: 0.1,
  minimum_score: 0.8, total_cost_budget: 0, per_run_cost_budget: 0, total_token_budget: 0, per_run_token_budget: 0,
  latency_ms_budget: 100, created_at: '2026-10-01T00:00:00.000Z' }
const legacyPositive = { id: 'result-1', policy_id: 'policy-1', candidate_id: 'candidate-1',
  observed_at: '2026-10-02T00:00:00.000Z', sample_count: 2, baseline_score: 0.7, candidate_score: 0.9,
  gain_lower_confidence_bound: 0.1, independently_verified: true, evidence_complete: true,
  confirmation_window_passed: true, authority_violations: 0, safety_failures: 0, accounting_complete: true,
  total_cost: 0, max_run_cost: 0, total_tokens: 0, max_run_tokens: 0, max_latency_ms: 5,
  disposition: 'REVIEW_REQUIRED', quality: 'IMPROVED', reasons: ['legacy aggregate'],
  automatic_promotion_allowed: false, created_at: '2026-10-02T00:00:00.000Z' }
setResponses([{ data: [scopedPolicy], error: null }, { data: [legacyPositive], error: null }])
const stateResult = await readLearningEvaluationCommandCenterState('project-1', 'admin-1')
assert.equal(stateResult.counts.improved, 0, 'legacy positive labels must not inflate verified improvement counts')
assert.equal(stateResult.decisions[0].attestationStatus, 'UNATTESTED')
console.log('PASS command center excludes legacy IMPROVED rows from verified improvement counts and labels them unattested')
