import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync('lib/agents/proactive-governed-case-learning-service.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260920014000_proactive_governed_case_learning.sql', 'utf8')
const forwardMigration = fs.readFileSync('supabase/migrations/20260920015000_reconcile_proactive_governed_case_learning.sql', 'utf8')
const replayPreparation = fs.readFileSync('scripts/prepare-clean-migration-replay.mjs', 'utf8')

for (const invariant of [
  'persistProactiveGovernedCaseLearningCandidate',
  'reviewProactiveGovernedCaseLearningCandidate',
  "rpc('create_positive_learning_case'",
  "rpc('review_positive_learning_case'",
  'Data Governance Admin actorUserId is required',
  'PGCL review reason is required',
  'APPROVE_WITH_EDITS requires a revised reusable lesson',
]) {
  assert.ok(service.includes(invariant), `missing PGCL service invariant: ${invariant}`)
}

for (const invariant of [
  "candidate_type in ('SKILL_IMPROVEMENT','POSITIVE_CASE')",
  "'POSITIVE_CASE_EXPERIENCE'",
  'create table if not exists agent.positive_learning_cases',
  'create table if not exists agent.positive_learning_case_occurrences',
  'create table if not exists agent.positive_learning_case_reviews',
  'create table if not exists agent.positive_learning_case_usages',
  'positive_learning_cases_candidate_project_uq',
  "review_status in ('PENDING_REVIEW','APPROVED','REJECTED','DEFERRED','ONE_OFF','RETIRED')",
  'create or replace function agent.create_positive_learning_case',
  'create or replace function agent.review_positive_learning_case',
  "v_case.review_status not in ('PENDING_REVIEW','DEFERRED')",
  "on conflict (candidate_id, source_agent_run_id) do nothing",
  "'BROADENED_APPLICABILITY' = any(v_significance)",
  "p_run_mode not in ('SUPERVISED','HANDSFREE')",
  'source agent run is missing or cross-project',
  'only SUCCEEDED agent runs may create positive learning cases',
  'positive learning case agent identity does not match source run',
  'positive learning case evidence must bind the exact source agent run',
  "v_verification_ref ~ '^native_trajectory_evaluation:[0-9a-fA-F-]{36}$'",
  "e.evaluator_type = 'NATIVE_TRAJECTORY'",
  "v_evaluation.dimensions->>'terminal_status'",
  'PGCL native trajectory evidence is not bound to the source run trajectory',
  "v_verification_ref ~ '^profile_run:[0-9a-fA-F-]{36}(:validated)?$'",
  'from profiling.profile_runs pr',
  "pr.status = 'COMPLETED'",
  'PGCL profile-run evidence is missing, incomplete, or cross-project',
  "v_verification_ref ~ '^agent_result_artifact:[0-9a-fA-F-]{36}$'",
  "a.artifact_type = 'AGENT_RUN_RESULT'",
  'PGCL result-artifact evidence is missing or not bound to the source run',
  "v_verification_ref ~ '^agent_run:[0-9a-fA-F-]{36}:succeeded$'",
  'PGCL successful-run evidence is missing or not bound to the source run',
  'unsupported PGCL verification evidence reference',
  "b.role_key = 'DATA_GOVERNANCE_ADMIN'",
  'Data Governance Admin authority is required to review a positive learning case',
  "when 'APPROVE_POSITIVE_CASE' then 'APPROVED'",
  "when 'APPROVE_WITH_EDITS' then 'APPROVED'",
  "when 'REJECT' then 'REJECTED'",
  "when 'DEFER' then 'DEFERRED'",
  "when 'MARK_ONE_OFF' then 'ONE_OFF'",
  "'PGCL_VERIFIED_POSITIVE_CASE_AWAITS_ADMIN_REVIEW'",
  "when 'APPROVE_POSITIVE_CASE' then 'ACTIVE'",
  "when 'APPROVE_WITH_EDITS' then 'ACTIVE'",
  "when 'REJECT' then 'REJECTED'",
  "when 'DEFER' then 'REVIEW_REQUIRED'",
  "when 'MARK_ONE_OFF' then 'RETIRED'",
  "and candidate_type = 'POSITIVE_CASE'",
  "and status = 'REVIEW_REQUIRED'",
  "'PGCL_ADMIN_DECISION:' || p_decision",
  'grant execute on function agent.create_positive_learning_case',
  'grant execute on function agent.review_positive_learning_case',
]) {
  assert.ok(migration.includes(invariant), `missing PGCL persistence invariant: ${invariant}`)
}

assert.ok(migration.includes('revoke all on function agent.create_positive_learning_case'))
assert.ok(migration.includes('revoke all on function agent.review_positive_learning_case'))
assert.ok(migration.includes('to service_role;'))
assert.equal(migration.includes('to authenticated;\ngrant execute on function agent.create_positive_learning_case'), false)
assert.equal(migration.includes('to authenticated;\ngrant execute on function agent.review_positive_learning_case'), false)

for (const invariant of [
  'may_auto_apply',
  'may_self_promote',
  'requires_human_review',
  'current_authorization_required_at_release',
]) {
  assert.ok(migration.includes(invariant), `missing governed-learning boundary: ${invariant}`)
}

assert.equal(/chain[-_ ]?of[-_ ]?thought/i.test(service + migration), false)
assert.equal(/hidden[-_ ]?reasoning/i.test(service + migration), false)

assert.match(migration, /\nas \$\n[\s\S]*\n\$;\n/, 'immutable historical PGCL migration should retain its audited syntax defect')
assert.equal(/\nas \$\n/.test(forwardMigration), false, 'forward PGCL reconciliation must not reuse malformed dollar quoting')
assert.equal(/\n\$;\n/.test(forwardMigration), false, 'forward PGCL reconciliation must not close malformed dollar quoting')
assert.ok(forwardMigration.includes('create table if not exists agent.positive_learning_cases'))
assert.ok(forwardMigration.includes('create or replace function agent.list_approved_positive_learning_cases'))
for (const invariant of [
  "file === '20260920014000_proactive_governed_case_learning.sql'",
  "const malformedOpen = '\\nas $\\n  select\\n'",
  "const malformedClose = '\\n$;\\n\\nrevoke all on function agent.list_approved_positive_learning_cases'",
  "const validOpen = '\\nas $\\n  select\\n'",
  "const validClose = '\\n$;\\n\\nrevoke all on function agent.list_approved_positive_learning_cases'",
  "replace(malformedOpen, validOpen)",
  "replace(malformedClose, validClose)",
  'Historical PGCL dollar-quote defect no longer matches the audited replay repair contract',
  'production uses the forward-only reconciliation migration',
]) {
  assert.ok(replayPreparation.includes(invariant), `missing immutable PGCL replay repair invariant: ${invariant}`)
}

console.log('PGCL durable persistence remains project-scoped, canonically verified, admin-reviewed, and non-self-promoting.')
