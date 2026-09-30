import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const policy = fs.readFileSync('lib/agents/learning-evaluation-policy.ts', 'utf8')
const service = fs.readFileSync('lib/agents/governed-learning-evaluation-service.ts', 'utf8')
const approval = fs.readFileSync('lib/agents/governed-learning-release-approval.ts', 'utf8')
const release = fs.readFileSync('lib/agents/governed-learning-controlled-release.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260930123000_governed_learning_evaluation_release_admission.sql', 'utf8')

for (const invariant of [
  'assertLearningEvaluationEligibleForReleaseReview',
  "decision.quality !== 'IMPROVED'",
  "decision.disposition !== 'REVIEW_REQUIRED'",
  'automaticPromotionAllowed !== false',
]) assert.ok(policy.includes(invariant), `missing release admission invariant: ${invariant}`)

for (const invariant of [
  'registerLearningEvaluationPolicy',
  'recordLearningEvaluationDecision',
  'loadLearningReleaseAdmission',
  'datasetManifestId',
  "order('created_at', { ascending: false })",
  "The latest prospective evaluation decision is not eligible for release review.",
  'assertLearningEvaluationEligibleForReleaseReview',
]) assert.ok(service.includes(invariant), `missing evaluation service invariant: ${invariant}`)

for (const invariant of [
  'loadLearningReleaseAdmission',
  'evaluationPolicyRecordId',
  'evaluationResultId',
  'evaluationDatasetManifestId',
  'evaluationManifestHash',
  'evaluationMode',
  'evaluatorActorId',
  'Prospective evaluation admission does not match',
]) assert.ok(approval.includes(invariant), `release approval must bind ${invariant}`)

for (const invariant of [
  'loadLearningReleaseAdmission',
  'evaluationPolicyRecordId',
  'evaluationResultId',
  'evaluationDatasetManifestId',
  'evaluationManifestHash',
  'evaluationMode',
  'evaluatorActorId',
  'Prospective evaluation admission does not match',
]) assert.ok(release.includes(invariant), `controlled release must revalidate ${invariant}`)

for (const invariant of [
  'create table if not exists agent.learning_evaluation_policies',
  'create table if not exists agent.learning_evaluation_results',
  'dataset_manifest_id uuid not null',
  'learning_evaluation_policy_manifest_fk',
  'sealed benchmark dataset manifest not found in project',
  'evaluation policy manifest hash does not match registered dataset manifest',
  'registered dataset manifest version is outside evaluation dataset allowlist',
  'evaluation policy lock must follow candidate and dataset evidence cutoffs',
  'evaluation governance references must be non-empty',
  'record_learning_evaluation_policy',
  'record_learning_evaluation_result',
  'evaluator_actor_id <> proposer_actor_id',
  "quality in ('IMPROVED','REGRESSED','INCONCLUSIVE')",
  "disposition in ('STOPPED','REJECTED','REVIEW_REQUIRED')",
  'automatic_promotion_allowed boolean not null default false check (automatic_promotion_allowed = false)',
  'improved evaluation still requires release review',
  'improved evaluation does not satisfy locked release admission policy',
  'p_gain_lower_confidence_bound > p_candidate_score - p_baseline_score',
  'recordedBy is required',
  'v_existing.dataset_manifest_id <> p_dataset_manifest_id',
  'v_existing.dataset_version_ids is distinct from p_dataset_version_ids',
  'v_existing.evaluator_actor_id',
  'v_existing.analysis_plan_ref',
  'v_existing.total_cost_budget',
  'v_existing.total_token_budget',
  'v_existing.latency_ms_budget',
  'reject_learning_evaluation_policy_mutation',
  'reject_learning_evaluation_result_mutation',
  'grant select on agent.learning_evaluation_policies to authenticated, service_role',
  'grant select on agent.learning_evaluation_results to authenticated, service_role',
]) assert.ok(migration.includes(invariant), `missing persistence invariant: ${invariant}`)

assert.equal(
  /grant\s+(insert|update|delete)/i.test(migration),
  false,
  'learning evaluation evidence must not expose direct table mutation grants',
)
assert.equal(
  service.includes(".eq('quality', 'IMPROVED')"),
  false,
  'release admission must inspect the latest decision overall rather than select an older positive result',
)
assert.equal(
  /automatic_promotion_allowed\s+boolean[^\n]*default\s+true/i.test(migration),
  false,
  'prospective evaluation must never enable automatic promotion',
)

console.log('Prospective learning evaluation is append-only, independently bound, fail-closed, and required by release approval and controlled release revalidation.')
