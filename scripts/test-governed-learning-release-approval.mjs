import './lib/register-typescript-resolution.mjs'
import assert from 'node:assert/strict'
import fs from 'node:fs'

const { getAgentActionProfile } = await import('../lib/governance/agent-action-catalog.ts')
const { approvalRequirement } = await import('../lib/governance/agent-policy-v2.ts')

const profile = getAgentActionProfile('PROMOTE_LEARNING_CANDIDATE')
assert.equal(profile.capability, 'agent.admin')
assert.equal(profile.requestCapability, 'agent.admin')
assert.equal(profile.target, 'PROJECT')
assert.equal(profile.materialProductionMutation, true)
assert.equal(profile.reversibility, 'REVERSIBLE')
assert.equal(profile.productionScope, 'HIGH')

const productionRequirement = approvalRequirement({
  environment: 'PRODUCTION',
  materialProductionMutation: profile.materialProductionMutation,
  businessCriticality: 'STANDARD',
  dataSensitivity: 'LOW',
  financialImpact: profile.financialImpact,
  productionScope: profile.productionScope,
  reversibility: profile.reversibility,
  computeCost: profile.computeCost,
})
assert.equal(productionRequirement.requiresBusinessApproval, true)
assert.equal(productionRequirement.requiresGovernanceApproval, true)
assert.equal(productionRequirement.breakGlassAllowed, false)

const service = fs.readFileSync('lib/agents/governed-learning-release-approval.ts', 'utf8')
for (const invariant of [
  "candidate.status !== 'REVIEW_REQUIRED'",
  "benchmark.gate_status !== 'REVIEW_REQUIRED'",
  "lifecycle.lifecycle_state !== 'CANDIDATE'",
  "actionKey: 'PROMOTE_LEARNING_CANDIDATE'",
  'currentExecutionFingerprint',
  'validateApprovalForExecution',
  "expectedActionKey: 'PROMOTE_LEARNING_CANDIDATE'",
  'bind_learning_candidate_approval_request',
  'approve_learning_candidate_for_controlled_release',
]) {
  assert.ok(service.includes(invariant), `missing governed release approval invariant: ${invariant}`)
}
assert.equal(
  service.includes('transitionAgentVersionLifecycle'),
  false,
  'release approval must not activate or mutate the agent version lifecycle',
)
assert.equal(
  service.includes('markApprovalExecuted'),
  false,
  'approval evidence must not be finalized as executed before controlled release actually occurs',
)

const migration = fs.readFileSync('supabase/migrations/20260920012000_governed_learning_release_approval.sql', 'utf8')
for (const invariant of [
  "'PROMOTE_LEARNING_CANDIDATE'",
  'create table if not exists agent.learning_candidate_approval_links',
  'create or replace function agent.bind_learning_candidate_approval_request',
  'create or replace function agent.approve_learning_candidate_for_controlled_release',
  "v_candidate.status <> 'REVIEW_REQUIRED'",
  "v_benchmark.gate_status <> 'REVIEW_REQUIRED'",
  "v_lifecycle.lifecycle_state <> 'CANDIDATE'",
  "v_request.action_key <> 'PROMOTE_LEARNING_CANDIDATE'",
  "v_request.material_production_mutation is not true",
  "v_request.status <> 'READY_TO_EXECUTE'",
  'v_request.approval_expires_at <= statement_timestamp()',
  "set status = 'APPROVED_FOR_CONTROLLED_RELEASE'",
  'revoke all on agent.learning_candidate_approval_links from public, anon, authenticated, service_role',
  'grant select on agent.learning_candidate_approval_links to authenticated, service_role',
]) {
  assert.ok(migration.includes(invariant), `missing governed release persistence invariant: ${invariant}`)
}

assert.equal(
  migration.includes("set lifecycle_state = 'ACTIVE'"),
  false,
  'approval migration must not activate an agent definition',
)
assert.equal(
  migration.includes("set status = 'ACTIVE'"),
  false,
  'approval migration must not activate a learning candidate',
)
assert.equal(
  migration.includes('finalize_agent_approval_execution'),
  false,
  'approval migration must not claim controlled release execution occurred',
)
assert.equal(
  /default array\[[\s\S]*PROMOTE_LEARNING_CANDIDATE/.test(migration),
  false,
  'existing approval authorities must not silently inherit learning promotion authority',
)

console.log('Governed learning release approval reuses Agent Policy v2, requires dual-axis production approval, and stops before activation.')
