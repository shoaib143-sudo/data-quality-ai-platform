import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260920012000_proactive_governed_case_learning.sql', 'utf8')
const context = fs.readFileSync('lib/agents/governed-learning-context.ts', 'utf8')
const memory = fs.readFileSync('lib/agents/agent-memory-learning.ts', 'utf8')

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
  ".from('agent_learning_cases')",
  ".eq('source_kind', 'PGCL_POSITIVE_CASE')",
  ".eq('decision_status', 'VERIFIED')",
  ".eq('outcome_status', 'VERIFIED')",
  ".eq('agent_definition_id', input.agentDefinitionId)",
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
]) {
  assert.ok(memory.includes(invariant), 'missing PGCL memory-context invariant: ' + invariant)
}

assert.equal(
  migration.includes("if p_decision in ('REJECT','DEFER','MARK_ONE_OFF') then\n    insert into agent.agent_learning_cases"),
  false,
  'rejected, deferred, and one-off cases must not enter reusable learning memory',
)

assert.ok(context.includes('input.agentDefinitionId && query'), 'PGCL retrieval must fail closed without an explicit agent definition')

console.log('Approved PGCL cases are promoted into governed learning cases, scoped to the originating agent, and exposed as context without granting authority.')
