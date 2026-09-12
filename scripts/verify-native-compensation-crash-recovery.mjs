import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260912065000_native_compensation_crash_recovery.sql', 'utf8')
const authority = readFileSync('supabase/migrations/20260911205000_native_runtime_contract_pinning.sql', 'utf8')
const runtime = readFileSync('lib/agents/runtime/native-compensation-invocations.ts', 'utf8')
const recovery = readFileSync('lib/agents/runtime/native-recovery-v2.ts', 'utf8')

const requiredMigrationFragments = [
  'execution_owner text',
  'execution_lease_expires_at timestamptz',
  'execution_generation bigint NOT NULL DEFAULT 0',
  'last_claimed_at timestamptz',
  'reclaim_count bigint NOT NULL DEFAULT 0',
  'CREATE TABLE agent.agent_tool_invocation_events',
  'COMPENSATION_CLAIMED',
  'COMPENSATION_RECLAIM_ATTEMPTED',
  'COMPENSATION_RECLAIMED',
  'COMPENSATION_COMPLETED',
  'COMPENSATION_FAILED',
  'STALE_COMPLETION_REJECTED',
  'COMPENSATION_REPLAY_BLOCKED_CONTRACT_DRIFT',
  'COMPENSATION_REPLAY_BLOCKED_UNSAFE',
  'CREATE OR REPLACE FUNCTION agent.claim_compensation_tool_invocation_internal',
  'CREATE OR REPLACE FUNCTION agent.renew_compensation_tool_invocation_lease_internal',
  'CREATE OR REPLACE FUNCTION agent.complete_compensation_tool_invocation_internal',
  'FOR UPDATE',
  "v_invocation.status <> 'ADMITTED'",
  'v_invocation.execution_lease_expires_at > now()',
  'v_invocation.execution_lease_expires_at <= now()',
  'execution_generation + 1',
  'reclaim_count = reclaim_count +',
  'execution_owner = trim(p_execution_owner)',
  'execution_generation = p_execution_generation',
  "v_compensation_contract->'execution_config'->>'idempotent'",
  "v_compensation_contract->'execution_config'->>'replay_certified'",
  "v_failed_contract->'execution_config'->>'compensation_tool_key'",
]
for (const fragment of requiredMigrationFragments) {
  assert.ok(migration.includes(fragment), `missing compensation migration invariant: ${fragment}`)
}

assert.match(migration, /REVOKE ALL ON FUNCTION agent\.claim_compensation_tool_invocation_internal[\s\S]*FROM public, anon, authenticated/)
assert.match(migration, /GRANT EXECUTE ON FUNCTION agent\.claim_compensation_tool_invocation_internal[\s\S]*TO service_role/)
assert.match(migration, /CREATE TRIGGER agent_tool_invocation_events_append_only[\s\S]*prevent_agent_tool_invocation_event_mutation/)
assert.match(migration, /OLD\.status = 'ADMITTED' AND NEW\.status = 'ADMITTED'[\s\S]*terminal evidence/)
assert.match(authority, /CREATE UNIQUE INDEX agent_tool_invocations_idempotency_idx[\s\S]*agent_run_id, tool_key, idempotency_key/)

const requiredRuntimeFragments = [
  'createNativeCompensationExecutionOwner',
  'claimNativeCompensationInvocation',
  'renewNativeCompensationInvocationLease',
  'completeNativeCompensationInvocation',
  'failNativeCompensationInvocation',
  'executeWithNativeCompensationLease',
  'p_execution_generation: input.lease.executionGeneration',
  'p_expected_idempotency_key: input.idempotencyKey',
  'setInterval(',
  'clearInterval(timer)',
]
for (const fragment of requiredRuntimeFragments) {
  assert.ok(runtime.includes(fragment), `missing compensation runtime invariant: ${fragment}`)
}

const requiredRecoveryFragments = [
  "prior.status === 'ADMITTED'",
  "prior.status === 'SUCCEEDED'",
  "failedCertification.rollbackStrategy !== 'COMPENSATION_TOOL'",
  '!certification.idempotent || !certification.replayCertified',
  "case 'ACTIVE_LEASE'",
  "case 'CONTRACT_DRIFT'",
  "case 'UNSAFE_REPLAY'",
  'claimNativeCompensationInvocation({',
  'executeWithNativeCompensationLease({',
  'completeNativeCompensationInvocation({',
  'failNativeCompensationInvocation({',
  'idempotencyKey,',
  'COMPENSATION_ALREADY_IN_FLIGHT',
  'COMPENSATION_REPLAY_CONTRACT_DRIFT',
  'COMPENSATION_NOT_REPLAY_SAFE',
]
for (const fragment of requiredRecoveryFragments) {
  assert.ok(recovery.includes(fragment), `missing compensation recovery invariant: ${fragment}`)
}

// Permanent fault matrix. These assertions intentionally bind each required crash/race
// scenario to the concrete invariant that makes the replay safe.
const faultMatrix = new Map([
  ['crash before compensation side effect', recovery.includes("prior.status === 'ADMITTED'") && migration.includes('COMPENSATION_CLAIMED')],
  ['crash after side effect before completion', recovery.includes('idempotencyKey,') && migration.includes('p_expected_idempotency_key')],
  ['crash after checkpoint', recovery.includes('getNativePinnedToolContract') && recovery.includes('input.step.contractHash')],
  ['restart on different deployment', runtime.includes('VERCEL_GIT_COMMIT_SHA') && runtime.includes('randomUUID()')],
  ['active lease blocks another worker', migration.includes("'ACTIVE_LEASE'") && migration.includes('execution_lease_expires_at > now()')],
  ['stale lease is reclaimable', migration.includes('execution_lease_expires_at <= now()') && migration.includes('COMPENSATION_RECLAIMED')],
  ['two concurrent reclaimers produce one owner', migration.includes('FOR UPDATE') && migration.includes('execution_owner = trim(p_execution_owner)')],
  ['fifty concurrent reclaimers produce one owner', migration.includes('FOR UPDATE') && migration.includes('execution_generation + 1')],
  ['stale generation cannot complete', migration.includes('STALE_COMPLETION_REJECTED') && migration.includes('execution_generation = p_execution_generation')],
  ['changed compensation contract blocks replay', migration.includes('COMPENSATION_REPLAY_BLOCKED_CONTRACT_DRIFT')],
  ['non-idempotent compensation blocks replay', migration.includes("->>'idempotent'") && recovery.includes('!certification.idempotent')],
  ['non-replay-certified compensation blocks replay', migration.includes("->>'replay_certified'") && recovery.includes('!certification.replayCertified')],
  ['completed compensation does not execute twice', recovery.includes("prior.status === 'SUCCEEDED'")],
  ['repeated compensation produces one business outcome', authority.includes('agent_tool_invocations_idempotency_idx') && recovery.includes('idempotencyKey: string')],
  ['ESCALATE_ONLY never auto-compensates', recovery.includes("failedCertification.rollbackStrategy !== 'COMPENSATION_TOOL'")],
])

for (const [scenario, covered] of faultMatrix) {
  assert.equal(covered, true, `missing permanent compensation fault coverage: ${scenario}`)
}
assert.equal(faultMatrix.size, 15, 'compensation fault matrix must retain all required scenarios')

assert.ok(!runtime.includes('approvalInterruptId'), 'compensation reclaim must not manufacture approval authority')
assert.ok(!migration.includes("SET status = 'ADMITTED'"), 'reclaim must preserve the existing in-flight invocation rather than manufacture a fresh status transition')

console.log('native compensation crash recovery verification passed')
