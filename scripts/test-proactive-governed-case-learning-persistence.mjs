import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync('lib/agents/proactive-governed-case-learning-service.ts', 'utf8')
const migration = fs.readFileSync('supabase/migrations/20260920012000_proactive_governed_case_learning.sql', 'utf8')

for (const invariant of [
  'persistProactiveGovernedCaseLearningCandidate',
  'reviewProactiveGovernedCaseLearningCandidate',
  "rpc('create_positive_learning_case'",
  "rpc('review_positive_learning_case'",
  'Data Governance Admin actorUserId is required',
  'PGCL review reason is required',
  'APPROVE_WITH_EDITS requires a revised reusable lesson',
  "v_case.review_status not in ('PENDING_REVIEW','DEFERRED')",
  "on conflict (candidate_id, source_agent_run_id) do nothing",
  "'BROADENED_APPLICABILITY' = any(v_significance)",
]) {
  assert.ok(service.includes(invariant), `missing PGCL service invariant: ${invariant}`)
}

for (const invariant of [
  "candidate_type in ('SKILL_IMPROVEMENT','POSITIVE_CASE')",
  "'POSITIVE_CASE_EXPERIENCE'",
  'create table if not exists agent.positive_learning_cases',
  'create table if not exists agent.positive_learning_case_occurrences',
  'create table if not exists agent.positive_learning_case_reviews',
  'positive_learning_cases_candidate_project_uq',
  "review_status in ('PENDING_REVIEW','APPROVED','REJECTED','DEFERRED','ONE_OFF','RETIRED')",
  'create or replace function agent.create_positive_learning_case',
  'create or replace function agent.review_positive_learning_case',
  "p_run_mode not in ('SUPERVISED','HANDSFREE')",
  'source agent run is missing or cross-project',
  "b.role_key = 'DATA_GOVERNANCE_ADMIN'",
  'Data Governance Admin authority is required to review a positive learning case',
  "when 'APPROVE_POSITIVE_CASE' then 'APPROVED'",
  "when 'APPROVE_WITH_EDITS' then 'APPROVED'",
  "when 'REJECT' then 'REJECTED'",
  "when 'DEFER' then 'DEFERRED'",
  "when 'MARK_ONE_OFF' then 'ONE_OFF'",
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

console.log('PGCL durable persistence remains project-scoped, admin-reviewed, service-role mediated, and non-self-promoting.')
