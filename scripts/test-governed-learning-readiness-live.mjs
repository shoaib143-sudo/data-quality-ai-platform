import assert from 'node:assert/strict'
import fs from 'node:fs'

const adapter = fs.readFileSync('lib/agents/governed-learning-readiness-live.ts', 'utf8')
const migration = fs.readFileSync(
  'supabase/migrations/20260920017000_governed_learning_readiness_evidence.sql',
  'utf8',
)

for (const invariant of [
  "authorizeProject(input.actorUserId, input.projectId, 'admin.manage')",
  'GOVERNED_AGENT_KEYS.length === 8',
  'PGCL_AGENT_DEFAULT_SKILL[agentKey]',
  "schema('agent').rpc(",
  "'get_governed_learning_readiness_evidence'",
  'productionEligibleApprovedPositiveCaseCount',
  'productionEligibleSuccessfulPositiveCaseUsageCount',
]) {
  assert.ok(adapter.includes(invariant), `missing live readiness adapter invariant: ${invariant}`)
}

for (const invariant of [
  'create or replace function agent.get_governed_learning_readiness_evidence',
  "'agent.learning_candidates'",
  "'agent.learning_candidate_releases'",
  "'agent.positive_learning_cases'",
  "'agent.agent_run_learning_provenance'",
  'c.relrowsecurity',
  "b.role_key = 'DATA_GOVERNANCE_ADMIN'",
  "r.status = 'SUCCEEDED'",
  "p.classification = 'PRODUCTION_ELIGIBLE'",
  "e.evaluator_type = 'NATIVE_TRAJECTORY'",
  "a.artifact_type = 'AGENT_RUN_RESULT'",
  "pr.status = 'COMPLETED'",
  "plc.review_status = 'APPROVED'",
  "u.usage_status = 'SUCCEEDED'",
  'productionEligibleApprovedPositiveCaseCount',
  'productionEligibleSuccessfulPositiveCaseUsageCount',
  'revoke all on function agent.get_governed_learning_readiness_evidence(uuid)',
  'to service_role;',
]) {
  assert.ok(migration.includes(invariant), `missing live readiness SQL invariant: ${invariant}`)
}

for (const forbidden of [
  'insert into agent.learning_candidates',
  'update agent.learning_candidates',
  'activate_learning_candidate',
  'review_positive_learning_case',
  'grant execute on function agent.get_governed_learning_readiness_evidence(uuid)\n  to authenticated',
]) {
  assert.equal(
    migration.includes(forbidden),
    false,
    `live readiness evidence must remain read-only/service-role-only: ${forbidden}`,
  )
}

console.log('Live governed-learning readiness evidence is project-scoped, production-provenance-aware, read-only, and service-role-only.')
