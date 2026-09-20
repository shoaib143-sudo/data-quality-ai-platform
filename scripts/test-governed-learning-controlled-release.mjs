import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const service = fs.readFileSync('lib/agents/governed-learning-controlled-release.ts', 'utf8')
for (const invariant of [
  'currentExecutionFingerprint',
  'validateApprovalForExecution',
  "expectedActionKey: 'PROMOTE_LEARNING_CANDIDATE'",
  'start_learning_candidate_canary',
  'record_learning_candidate_canary_evidence',
  'evaluate_learning_candidate_canary',
  'activate_learning_candidate',
  'rollback_learning_candidate',
  "authorizeProject(input.actorUserId, input.projectId, 'agent.admin')",
]) {
  assert.ok(service.includes(invariant), `missing controlled release service invariant: ${invariant}`)
}

const migration = fs.readFileSync('supabase/migrations/20260920013000_governed_learning_controlled_release.sql', 'utf8')
for (const invariant of [
  'create table if not exists agent.learning_candidate_releases',
  'create table if not exists agent.learning_candidate_canary_evidence',
  'create or replace function agent.start_learning_candidate_canary',
  'create or replace function agent.record_learning_candidate_canary_evidence',
  'create or replace function agent.evaluate_learning_candidate_canary',
  'create or replace function agent.activate_learning_candidate',
  'create or replace function agent.rollback_learning_candidate',
  "v_candidate.status <> 'APPROVED_FOR_CONTROLLED_RELEASE'",
  "v_candidate_lifecycle.lifecycle_state <> 'CANDIDATE'",
  "v_baseline_lifecycle.lifecycle_state <> 'ACTIVE'",
  "'NON_AUTHORITATIVE_SHADOW_CANARY_STARTED'",
  "metadata->>'shadow_execution'",
  "metadata->>'production_action_authority'",
  "metadata->>'learning_candidate_id'",
  "metadata->>'learning_release_id'",
  "metadata->>'agent_definition_id'",
  "metadata->>'candidate_version'",
  "v_target_status := 'VERIFIED'",
  "v_target_status := 'NOT_READY'",
  "v_candidate.status <> 'VERIFIED'",
  "perform agent.transition_agent_version_lifecycle(",
  "'ACTIVE'",
  'perform governance.finalize_agent_approval_execution(',
  "v_candidate.status <> 'ACTIVE'",
  "v_baseline_lifecycle.lifecycle_state <> 'DEPRECATED'",
  "'ROLLED_BACK'",
]) {
  assert.ok(migration.includes(invariant), `missing controlled release persistence invariant: ${invariant}`)
}

const canaryStart = migration.slice(
  migration.indexOf('create or replace function agent.start_learning_candidate_canary'),
  migration.indexOf('create or replace function agent.record_learning_candidate_canary_evidence'),
)
assert.equal(
  canaryStart.includes("transition_agent_version_lifecycle"),
  false,
  'starting canary must not change agent version lifecycle',
)
assert.equal(
  canaryStart.includes("lifecycle_state = 'ACTIVE'"),
  false,
  'starting canary must not activate the candidate definition',
)
assert.ok(
  canaryStart.includes("v_baseline_lifecycle.lifecycle_state <> 'ACTIVE'"),
  'baseline must remain active throughout shadow canary',
)
assert.ok(
  canaryStart.includes("v_candidate_lifecycle.lifecycle_state <> 'CANDIDATE'"),
  'candidate must remain non-executable CANDIDATE throughout shadow canary',
)

const evidenceSection = migration.slice(
  migration.indexOf('create or replace function agent.record_learning_candidate_canary_evidence'),
  migration.indexOf('create or replace function agent.evaluate_learning_candidate_canary'),
)
assert.match(evidenceSection, /synthetic/)
assert.match(evidenceSection, /shadow_execution/)
assert.match(evidenceSection, /production_action_authority/)
assert.match(evidenceSection, /v_eval\.score is null or v_eval\.pass is null/)

const activation = migration.slice(
  migration.indexOf('create or replace function agent.activate_learning_candidate'),
  migration.indexOf('create or replace function agent.rollback_learning_candidate'),
)
const promoteAt = activation.indexOf('transition_agent_version_lifecycle')
const finalizeAt = activation.indexOf('finalize_agent_approval_execution')
assert.ok(promoteAt >= 0 && finalizeAt > promoteAt, 'activation must promote version before finalizing the same transaction approval evidence')
assert.match(activation, /v_request\.status <> 'READY_TO_EXECUTE'/)
assert.match(activation, /approval_expires_at <= statement_timestamp\(\)/)
assert.match(activation, /set status = 'ACTIVE'/)
assert.match(activation, /'LEARNING_CANDIDATE_RELEASE'/)

const rollback = migration.slice(migration.indexOf('create or replace function agent.rollback_learning_candidate'))
assert.match(rollback, /baseline_agent_definition_id/)
assert.match(rollback, /'DEPRECATED'/)
assert.match(rollback, /transition_agent_version_lifecycle/)
assert.match(rollback, /set status = 'ROLLED_BACK'/)

assert.equal(
  migration.includes('grant execute on function agent.start_learning_candidate_canary(uuid,uuid,uuid,uuid,integer,numeric)\n  to authenticated'),
  false,
  'browser roles must not start controlled canary directly',
)
assert.equal(
  migration.includes('grant execute on function agent.activate_learning_candidate(uuid,uuid,uuid,uuid)\n  to authenticated'),
  false,
  'browser roles must not activate learning candidates directly',
)

console.log('Governed learning controlled release preserves non-authoritative canary, atomic activation, approval finalization, and exact-baseline rollback.')
