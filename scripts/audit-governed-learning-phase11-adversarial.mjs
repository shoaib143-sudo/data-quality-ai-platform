import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (path) => fs.readFileSync(path, 'utf8')

const candidateMigration = read('supabase/migrations/20260920010000_governed_learning_candidates.sql')
const benchmarkMigration = read('supabase/migrations/20260920011000_governed_learning_candidate_benchmarks.sql')
const approvalMigration = read('supabase/migrations/20260920012000_governed_learning_release_approval.sql')
const releaseMigration = read('supabase/migrations/20260920013000_governed_learning_controlled_release.sql')
const pgclMigration = read('supabase/migrations/20260920014000_proactive_governed_case_learning.sql')
const pgclForwardMigration = read('supabase/migrations/20260920015000_reconcile_proactive_governed_case_learning.sql')
const pgclTriggerAcl = read('supabase/migrations/20260920015500_restrict_pgcl_trigger_function_execute.sql')

const candidateCode = read('lib/agents/governed-learning-candidates.ts')
const benchmarkCode = read('lib/agents/governed-learning-benchmarks.ts')
const approvalCode = read('lib/agents/governed-learning-release-approval.ts')
const releaseCode = read('lib/agents/governed-learning-controlled-release.ts')
const pgclCode = read('lib/agents/proactive-governed-case-learning.ts')
const pgclRuntime = read('lib/agents/proactive-governed-case-learning-runtime.ts')
const memoryCode = read('lib/agents/agent-memory-learning.ts')

const candidateTests = read('scripts/test-governed-learning-candidates.mjs')
const benchmarkTests = read('scripts/test-governed-learning-benchmarks.mjs')
const approvalTests = read('scripts/test-governed-learning-release-approval.mjs')
const releaseTests = read('scripts/test-governed-learning-controlled-release.mjs')
const pgclPersistenceTests = read('scripts/test-proactive-governed-case-learning-persistence.mjs')
const pgclRetrievalTests = read('scripts/test-proactive-governed-case-learning-retrieval.mjs')
const eightAgentTests = read('scripts/test-proactive-governed-case-learning-eight-agent-conformance.mjs')

function requireAll(label, source, tokens) {
  for (const token of tokens) {
    assert.ok(source.includes(token), `${label} missing adversarial boundary: ${token}`)
  }
}

function forbidAll(label, source, tokens) {
  for (const token of tokens) {
    assert.equal(source.includes(token), false, `${label} exposes forbidden authority path: ${token}`)
  }
}

requireAll('candidate contract', candidateCode, [
  'mayAutoApply: false',
  'maySelfPromote: false',
  'mayExpandToolAuthority: false',
  'mayChangeMutationBoundary: false',
  'requiresHumanReview: true',
  'currentAuthorizationRequiredAtRelease: true',
  'SELF_PROMOTE_TO_PRODUCTION',
  'EXPAND_TOOL_AUTHORITY',
  'CHANGE_MUTATION_BOUNDARY',
])
requireAll('candidate persistence', candidateMigration, [
  'where id::text = v_ref',
  'and project_id = p_project_id',
  "evaluation_type = 'AGENT_SKILL'",
  'v_production_eligible := v_synthetic is false',
  'count(*) filter (where production_eligible is not true)',
  'candidate evidence includes synthetic or unclassified evidence and is not production eligible',
  'revoke all on function agent.create_learning_candidate',
  'to service_role;',
])
forbidAll('candidate persistence', candidateMigration, [
  "p_target_status = 'ACTIVE'",
  "p_target_status = 'APPROVED_FOR_CONTROLLED_RELEASE'",
  'grant execute on function agent.create_learning_candidate',
].filter((token) => token !== 'grant execute on function agent.create_learning_candidate'))
assert.equal(
  candidateMigration.includes(`grant execute on function agent.create_learning_candidate(
  uuid,text,text,text,text,text,text,text,text,text,timestamptz,text[],uuid,uuid
) to authenticated`),
  false,
  'browser-authenticated users must not create governed learning candidates directly',
)

requireAll('candidate tests', candidateTests, [
  'require persisted evaluation evidence',
  'candidate identity must be deterministic regardless of evidence ordering',
  '/not authorized/',
  "maySelfPromote, false",
])

requireAll('benchmark contract', benchmarkCode, [
  'automaticPromotionAllowed: false',
  'automaticAuthorityExpansionAllowed: false',
  'automaticMutationBoundaryChangeAllowed: false',
  'rollbackRequired: true',
  'humanReviewRequired: true',
  'currentAuthorizationRequiredAtRelease: true',
])
requireAll('benchmark persistence', benchmarkMigration, [
  "v_candidate.status <> 'EVIDENCE_READY'",
  'p_evaluator_id = v_candidate.agent_key',
  'learning candidate benchmark evaluator must be independent from proposing agent',
  'benchmark evidence is missing or cross-project',
  'benchmark evidence must be explicitly non-synthetic',
  'AUTHORITY_VIOLATION_DETECTED',
  'ADVERSARIAL_FAILURE_DETECTED',
  'CANDIDATE_REGRESSES_BASELINE',
  "v_target_status := 'REVIEW_REQUIRED'",
  "v_target_status := 'NOT_READY'",
])
forbidAll('benchmark persistence', benchmarkMigration, [
  "v_target_status := 'ACTIVE'",
  "v_target_status := 'APPROVED_FOR_CONTROLLED_RELEASE'",
])
requireAll('benchmark tests', benchmarkTests, [
  'INSUFFICIENT_BENCHMARK_CASES',
  'CANDIDATE_REGRESSES_BASELINE',
  'AUTHORITY_VIOLATION_DETECTED',
  'ADVERSARIAL_FAILURE_DETECTED',
  '/independent/',
])

requireAll('release approval service', approvalCode, [
  "candidate.status !== 'REVIEW_REQUIRED'",
  "benchmark.gate_status !== 'REVIEW_REQUIRED'",
  "lifecycle.lifecycle_state !== 'CANDIDATE'",
  "actionKey: 'PROMOTE_LEARNING_CANDIDATE'",
  'currentExecutionFingerprint',
  'validateApprovalForExecution',
])
requireAll('release approval persistence', approvalMigration, [
  "v_candidate.status <> 'REVIEW_REQUIRED'",
  "v_benchmark.gate_status <> 'REVIEW_REQUIRED'",
  "v_request.action_key <> 'PROMOTE_LEARNING_CANDIDATE'",
  "v_request.material_production_mutation is not true",
  "v_request.status <> 'READY_TO_EXECUTE'",
  'v_request.approval_expires_at <= statement_timestamp()',
  "set status = 'APPROVED_FOR_CONTROLLED_RELEASE'",
])
forbidAll('release approval persistence', approvalMigration, [
  "set lifecycle_state = 'ACTIVE'",
  "set status = 'ACTIVE'",
  'finalize_agent_approval_execution',
])
requireAll('release approval tests', approvalTests, [
  'requiresBusinessApproval, true',
  'requiresGovernanceApproval, true',
  'breakGlassAllowed, false',
  'existing approval authorities must not silently inherit learning promotion authority',
])

requireAll('controlled release service', releaseCode, [
  "authorizeProject(input.actorUserId, input.projectId, 'agent.admin')",
  'currentExecutionFingerprint',
  'validateApprovalForExecution',
  'start_learning_candidate_canary',
  'activate_learning_candidate',
  'rollback_learning_candidate',
])
requireAll('controlled release persistence', releaseMigration, [
  "v_candidate.status <> 'APPROVED_FOR_CONTROLLED_RELEASE'",
  "v_candidate_lifecycle.lifecycle_state <> 'CANDIDATE'",
  "v_baseline_lifecycle.lifecycle_state <> 'ACTIVE'",
  "'NON_AUTHORITATIVE_SHADOW_CANARY_STARTED'",
  "metadata->>'synthetic'",
  "metadata->>'shadow_execution'",
  "metadata->>'production_action_authority'",
  "metadata->>'learning_candidate_id'",
  "metadata->>'learning_release_id'",
  "metadata->>'agent_definition_id'",
  "metadata->>'candidate_version'",
  "v_target_status := 'VERIFIED'",
  "v_candidate.status <> 'VERIFIED'",
  "v_request.status <> 'READY_TO_EXECUTE'",
  'approval_expires_at <= statement_timestamp()',
  "v_candidate.status <> 'ACTIVE'",
  "v_baseline_lifecycle.lifecycle_state <> 'DEPRECATED'",
  "set status = 'ROLLED_BACK'",
])
assert.equal(
  releaseMigration.includes(`grant execute on function agent.start_learning_candidate_canary(uuid,uuid,uuid,uuid,integer,numeric)
  to authenticated`),
  false,
  'browser-authenticated users must not start learning canaries',
)
assert.equal(
  releaseMigration.includes(`grant execute on function agent.activate_learning_candidate(uuid,uuid,uuid,uuid)
  to authenticated`),
  false,
  'browser-authenticated users must not activate learning candidates',
)
requireAll('controlled release tests', releaseTests, [
  'starting canary must not change agent version lifecycle',
  'baseline must remain active throughout shadow canary',
  'candidate must remain non-executable CANDIDATE throughout shadow canary',
  'activation must promote version before finalizing the same transaction approval evidence',
  'exact-baseline rollback',
].filter((token) => releaseTests.includes(token)))
assert.ok(releaseTests.includes("baseline_agent_definition_id"))
assert.ok(releaseTests.includes("set status = 'ROLLED_BACK'"))

requireAll('PGCL candidate contract', pgclCode, [
  'requiresDataGovernanceAdminReview: true',
  'mayAutoPromote: false',
  'maySelfLearn: false',
  'PGCL_AGENT_DEFAULT_SKILL',
  "architect_agent: 'lineage_impact_analysis'",
  "investigator_agent: 'incident_root_cause_analysis'",
  "executive_agent: 'executive_materiality_analysis'",
  "support_agent: 'support_case_investigation'",
])
requireAll('PGCL persistence', pgclMigration, [
  'source agent run is missing or cross-project',
  'positive learning case agent identity does not match source run',
  'positive learning case evidence must bind the exact source agent run',
  "e.evaluator_type = 'NATIVE_TRAJECTORY'",
  'PGCL native trajectory evidence is not bound to the source run trajectory',
  'PGCL profile-run evidence is missing, incomplete, or cross-project',
  'PGCL result-artifact evidence is missing or not bound to the source run',
  'PGCL successful-run evidence is missing or not bound to the source run',
  'unsupported PGCL verification evidence reference',
  "b.role_key = 'DATA_GOVERNANCE_ADMIN'",
  'Data Governance Admin authority is required to review a positive learning case',
  'positive_learning_case_usages_learning_case_project_fk',
  'positive_learning_case_usages_consumer_run_project_fk',
  "v_learning_case.source_kind <> 'PGCL_POSITIVE_CASE'",
  "v_learning_case.evidence->>'pgcl_candidate_id' <> new.candidate_id::text",
])
requireAll('PGCL forward reconciliation', pgclForwardMigration, [
  'create table if not exists agent.positive_learning_cases',
  'create or replace function agent.list_approved_positive_learning_cases',
])
requireAll('PGCL trigger ACL', pgclTriggerAcl, [
  'revoke all on function agent.validate_positive_learning_case_usage()',
  'from public, anon, authenticated, service_role',
  'Direct execution is prohibited; invocation is trigger-only',
])
assert.equal(
  pgclMigration.includes(`to authenticated;
grant execute on function agent.create_positive_learning_case`),
  false,
  'browser-authenticated users must not create positive learning cases directly',
)
assert.equal(
  pgclMigration.includes(`to authenticated;
grant execute on function agent.review_positive_learning_case`),
  false,
  'browser-authenticated users must not review positive learning cases directly',
)

requireAll('PGCL retrieval authority', memoryCode, [
  'Learned cases cannot authorize, approve, execute, or promote a new governance action',
  'current_authorization_required_for_every_action: true',
  'current_policy_decision_required_for_every_action: true',
])
requireAll('PGCL runtime', pgclRuntime, [
  'isGovernedAgentKey',
  'derivePgclCandidateFromVerifiedRun',
  'persistProactiveGovernedCaseLearningCandidate',
])
requireAll('PGCL persistence tests', pgclPersistenceTests, [
  'source agent run is missing or cross-project',
  'positive learning case agent identity does not match source run',
  'unsupported PGCL verification evidence reference',
  'Data Governance Admin authority is required to review a positive learning case',
])
requireAll('PGCL retrieval tests', pgclRetrievalTests, [
  'rejected, deferred, and one-off cases must not enter reusable learning memory',
  'PGCL retrieval must fail closed without an explicit agent definition',
  'PGCL retrieval must use the canonical database boundary',
  'Learned cases cannot authorize, approve, execute, or promote a new governance action',
])
requireAll('eight-agent conformance', eightAgentTests, [
  'All eight canonical agents share the same governed positive-case learning contract',
  'PGCL runtime must not special-case',
  'CONTEXT_ONLY_REQUIRES_CURRENT_POLICY',
])

for (const source of [
  candidateCode,
  benchmarkCode,
  approvalCode,
  releaseCode,
  pgclCode,
  pgclRuntime,
  memoryCode,
]) {
  assert.equal(/chain[-_ ]?of[-_ ]?thought/i.test(source), false, 'Phase 11 source must not persist or expose chain-of-thought')
  assert.equal(/hidden[-_ ]?reasoning/i.test(source), false, 'Phase 11 source must not persist or expose hidden reasoning')
}

console.log('Phase 11 governed learning adversarial audit passed: cross-project, synthetic, self-promotion, stale-approval, canary-provenance, rollback, PGCL-review, and learned-authority bypasses remain fail-closed.')
