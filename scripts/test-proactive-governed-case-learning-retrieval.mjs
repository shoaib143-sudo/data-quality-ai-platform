import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260920012000_proactive_governed_case_learning.sql', 'utf8')
const context = fs.readFileSync('lib/agents/governed-learning-context.ts', 'utf8')
const memory = fs.readFileSync('lib/agents/agent-memory-learning.ts', 'utf8')
const service = fs.readFileSync('lib/agents/proactive-governed-case-learning-service.ts', 'utf8')

for (const invariant of [
  "p_decision in ('APPROVE_POSITIVE_CASE','APPROVE_WITH_EDITS')",
  "insert into agent.agent_learning_cases",
  "'PGCL_POSITIVE_CASE'",
  "'VERIFIED'",
  "'ACTIVE'",
  "'pgcl:' || p_candidate_id::text",
  "'reusable_lesson'",
  "'applicability_conditions'",
  "'exclusion_conditions'",
  "'verification_evidence_refs'",
]) {
  assert.ok(migration.includes(invariant), 'missing approved-case promotion invariant: ' + invariant)
}

for (const invariant of [
  "rpc('list_approved_positive_learning_cases'",
  'p_project_id: input.projectId',
  'p_agent_definition_id: input.agentDefinitionId',
  'approvedPositiveCases',
]) {
  assert.ok(context.includes(invariant), 'missing PGCL retrieval invariant: ' + invariant)
}

for (const invariant of [
  'approvedPositiveCaseMatches',
  'approvedPositiveCases',
  'positiveCaseInfluenceEvidence',
  'use_admin_approved_positive_cases_as_context: true',
  'approved_positive_case_ids',
  'Learned cases cannot authorize, approve, execute, or promote a new governance action',
  'recordPositiveLearningCaseRetrievals',
]) {
  assert.ok(memory.includes(invariant), 'missing PGCL memory-context invariant: ' + invariant)
}

assert.equal(
  migration.includes("if p_decision in ('REJECT','DEFER','MARK_ONE_OFF') then\n    insert into agent.agent_learning_cases"),
  false,
  'rejected, deferred, and one-off cases must not enter reusable learning memory',
)

assert.ok(context.includes('input.agentDefinitionId && query'), 'PGCL retrieval must fail closed without an explicit agent definition')
assert.equal(context.includes(".from('agent_learning_cases')"), false, 'PGCL retrieval must use the canonical database boundary')

for (const invariant of [
  'recordPositiveLearningCaseRetrievals',
  'recordPositiveLearningCaseOutcome',
  "from('positive_learning_case_usages')",
  "usage_status: 'RETRIEVED'",
  "status: 'APPLIED' | 'SUCCEEDED' | 'FAILED' | 'DISMISSED'",
]) {
  assert.ok(service.includes(invariant), 'missing PGCL usage tracking invariant: ' + invariant)
}

for (const invariant of [
  'create table if not exists agent.positive_learning_case_usages',
  'create or replace function agent.list_approved_positive_learning_cases',
  "lc.source_kind = 'PGCL_POSITIVE_CASE'",
  "lc.agent_definition_id = p_agent_definition_id",
  "lc.decision_status = 'VERIFIED'",
  "lc.outcome_status = 'VERIFIED'",
  "grant execute on function agent.list_approved_positive_learning_cases",
  "usage_status in ('RETRIEVED','APPLIED','SUCCEEDED','FAILED','DISMISSED')",
  'positive_learning_case_usages_uq',
]) {
  assert.ok(migration.includes(invariant), 'missing PGCL usage schema invariant: ' + invariant)
}

console.log('Approved PGCL cases are promoted into governed learning cases, scoped to the originating agent, and exposed as context without granting authority.')
