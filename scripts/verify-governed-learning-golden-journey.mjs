import assert from 'node:assert/strict'
import fs from 'node:fs'

const outcomeMigration = fs.readFileSync('supabase/migrations/20260910144000_v5_governed_action_outcome_learning.sql', 'utf8')
const candidateMigration = fs.readFileSync('supabase/migrations/20260920010000_governed_learning_candidates.sql', 'utf8')
const benchmarkMigration = fs.readFileSync('supabase/migrations/20260920011000_governed_learning_candidate_benchmarks.sql', 'utf8')
const approvalMigration = fs.readFileSync('supabase/migrations/20260920012000_governed_learning_release_approval.sql', 'utf8')
const releaseMigration = fs.readFileSync('supabase/migrations/20260920013000_governed_learning_controlled_release.sql', 'utf8')
const pgclMigration = fs.readFileSync('supabase/migrations/20260920014000_proactive_governed_case_learning.sql', 'utf8')
const candidateCode = fs.readFileSync('lib/agents/governed-learning-candidates.ts', 'utf8')
const benchmarkCode = fs.readFileSync('lib/agents/governed-learning-benchmarks.ts', 'utf8')
const approvalCode = fs.readFileSync('lib/agents/governed-learning-release-approval.ts', 'utf8')
const releaseCode = fs.readFileSync('lib/agents/governed-learning-controlled-release.ts', 'utf8')
const memoryCode = fs.readFileSync('lib/agents/agent-memory-learning.ts', 'utf8')
const pgclCode = fs.readFileSync('lib/agents/proactive-governed-case-learning.ts', 'utf8')

const phases = [
  ['verified outcome authority', outcomeMigration, [
    'create table if not exists governance.governed_action_outcomes',
    'promote_verified_governed_action_outcome',
    "verification_state <> 'VERIFIED'",
  ]],
  ['durable learning candidate', candidateMigration, [
    'create table if not exists agent.learning_candidates',
    'create table if not exists agent.learning_candidate_evidence',
    "'PROPOSED','EVIDENCE_READY'",
  ]],
  ['independent benchmark', benchmarkMigration, [
    'create table if not exists agent.learning_candidate_benchmarks',
    "v_candidate.status <> 'EVIDENCE_READY'",
    "p_evaluator_id = v_candidate.agent_key",
    "v_target_status := 'REVIEW_REQUIRED'",
  ]],
  ['governed release approval', approvalMigration, [
    'create table if not exists agent.learning_candidate_approval_links',
    "'PROMOTE_LEARNING_CANDIDATE'",
    "set status = 'APPROVED_FOR_CONTROLLED_RELEASE'",
  ]],
  ['controlled release and rollback', releaseMigration, [
    'create table if not exists agent.learning_candidate_releases',
    "'NON_AUTHORITATIVE_SHADOW_CANARY_STARTED'",
    "v_target_status := 'VERIFIED'",
    "set status = 'ACTIVE'",
    "set status = 'ROLLED_BACK'",
  ]],
  ['proactive governed case learning', pgclMigration, [
    'create table if not exists agent.positive_learning_cases',
    "'PGCL_POSITIVE_CASE'",
    'list_approved_positive_learning_cases',
  ]],
]

for (const [name, source, tokens] of phases) {
  for (const token of tokens) {
    assert.ok(source.includes(token), `${name} is missing golden-journey contract: ${token}`)
  }
}

for (const invariant of [
  'mayAutoApply: false',
  'maySelfPromote: false',
  'mayExpandToolAuthority: false',
  'mayChangeMutationBoundary: false',
  'requiresHumanReview: true',
  'currentAuthorizationRequiredAtRelease: true',
]) {
  assert.ok(candidateCode.includes(invariant), `candidate authority boundary missing: ${invariant}`)
}

for (const invariant of [
  'automaticPromotionAllowed: false',
  'automaticAuthorityExpansionAllowed: false',
  'automaticMutationBoundaryChangeAllowed: false',
  'currentAuthorizationRequiredAtRelease: true',
  'humanReviewRequired: true',
]) {
  assert.ok(benchmarkCode.includes(invariant), `benchmark authority boundary missing: ${invariant}`)
}

for (const invariant of [
  "candidate.status !== 'REVIEW_REQUIRED'",
  "benchmark.gate_status !== 'REVIEW_REQUIRED'",
  'currentExecutionFingerprint',
  'validateApprovalForExecution',
]) {
  assert.ok(approvalCode.includes(invariant), `approval revalidation invariant missing: ${invariant}`)
}

for (const invariant of [
  'currentExecutionFingerprint',
  'validateApprovalForExecution',
  'start_learning_candidate_canary',
  'record_learning_candidate_canary_evidence',
  'evaluate_learning_candidate_canary',
  'activate_learning_candidate',
  'rollback_learning_candidate',
]) {
  assert.ok(releaseCode.includes(invariant), `controlled-release integration missing: ${invariant}`)
}

for (const invariant of [
  "lower(coalesce(v_eval.metadata->>'synthetic', v_eval.metadata->>'synthetic_bootstrap', '')) <> 'false'",
  "lower(coalesce(v_eval.metadata->>'shadow_execution','')) <> 'true'",
  "lower(coalesce(v_eval.metadata->>'production_action_authority','')) <> 'false'",
  "v_request.status <> 'READY_TO_EXECUTE'",
  'approval_expires_at <= statement_timestamp()',
]) {
  assert.ok(releaseMigration.includes(invariant), `negative controlled-release gate missing: ${invariant}`)
}

for (const invariant of [
  'learning candidate benchmark evaluator must be independent from proposing agent',
  'benchmark evidence is missing or cross-project',
  'benchmark evidence must be explicitly non-synthetic',
  'AUTHORITY_VIOLATION_DETECTED',
  'ADVERSARIAL_FAILURE_DETECTED',
  'CANDIDATE_REGRESSES_BASELINE',
]) {
  assert.ok(benchmarkMigration.includes(invariant), `benchmark fail-closed invariant missing: ${invariant}`)
}

for (const invariant of [
  'requiresDataGovernanceAdminReview: true',
  'mayAutoPromote: false',
  'maySelfLearn: false',
]) {
  assert.ok(pgclCode.includes(invariant), `PGCL governance boundary missing: ${invariant}`)
}

for (const invariant of [
  'Learned cases cannot authorize, approve, execute, or promote a new governance action',
  'current_authorization_required_for_every_action: true',
  'current_policy_decision_required_for_every_action: true',
]) {
  assert.ok(memoryCode.includes(invariant), `future-use authority boundary missing: ${invariant}`)
}

assert.equal(
  releaseMigration.includes("grant execute on function agent.activate_learning_candidate(uuid,uuid,uuid,uuid)\n  to authenticated"),
  false,
  'browser-authenticated users must not activate governed learning candidates directly',
)
assert.equal(
  approvalCode.includes('transitionAgentVersionLifecycle'),
  false,
  'human approval must remain separate from activation',
)

console.log('Phase 11 golden journey is cumulatively certified from verified outcome through governed reuse, with fail-closed benchmark, approval, canary, activation, rollback, and future-use authority boundaries.')
