import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260912104500_native_compensation_reclaim_fencing.sql', 'utf8')
const fencing = readFileSync('lib/agents/runtime/native-compensation-fencing.ts', 'utf8')
const recovery = readFileSync('lib/agents/runtime/native-recovery-v2.ts', 'utf8')

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

contains(migration, 'compensation_generation bigint NOT NULL DEFAULT 0', 'monotonic compensation generation')
contains(migration, 'compensation_owner_id uuid', 'compensation owner fence')
contains(migration, 'compensation_lease_expires_at timestamptz', 'compensation lease expiry')
contains(migration, "OLD.status = 'ADMITTED' AND NEW.status = 'RUNNING'", 'initial compensation claim transition')
contains(migration, 'NEW.compensation_generation <> OLD.compensation_generation + 1', 'stale reclaim generation increment')
contains(migration, 'OLD.compensation_lease_expires_at > now()', 'active lease exclusion')
contains(migration, "'reason', 'ACTIVE_LEASE'", 'active lease deterministic claim result')
contains(migration, "'reason', 'STALE_LEASE_RECLAIMED'", 'stale lease reclaim result')
contains(migration, 'FOR UPDATE', 'serialized concurrent claim decision')
contains(migration, 'compensation_owner_id = p_owner_id', 'owner completion fence')
contains(migration, 'compensation_generation = p_generation', 'generation completion fence')
contains(migration, 'COMPENSATION_FENCED: owner or generation was superseded', 'superseded worker rejection')
contains(migration, "IF v_invocation.status IN ('SUCCEEDED','FAILED','REJECTED')", 'terminal claim rejection')
contains(migration, "REVOKE ALL ON FUNCTION agent.claim_compensation_tool_invocation_internal", 'claim privilege boundary')
contains(migration, "REVOKE ALL ON FUNCTION agent.complete_compensation_tool_invocation_internal", 'completion privilege boundary')

contains(fencing, 'claim_compensation_tool_invocation_internal', 'runtime claim RPC')
contains(fencing, 'complete_compensation_tool_invocation_internal', 'runtime fenced completion RPC')
contains(fencing, 'NATIVE_COMPENSATION_HEARTBEAT_MS', 'lease heartbeat')
contains(fencing, 'setTimeout(renew, NATIVE_COMPENSATION_HEARTBEAT_MS)', 'heartbeat scheduling')
contains(fencing, 'claim.generation !== input.generation', 'heartbeat generation fence')
contains(fencing, 'claim.ownerId !== input.ownerId', 'heartbeat owner fence')

contains(recovery, "prior.status === 'ADMITTED' || prior.status === 'RUNNING'", 'recoverable admitted/running compensation')
contains(recovery, "return { decision: 'RESUME', invocationId: prior.id }", 'existing invocation resume path')
contains(recovery, 'createNativeCompensationOwnerId()', 'unique execution owner')
contains(recovery, 'claimNativeCompensationInvocation({', 'claim before compensation execution')
contains(recovery, 'withNativeCompensationLease({', 'heartbeat-wrapped compensation execution')
contains(recovery, 'completeNativeCompensationInvocation({', 'fenced successful completion')
contains(recovery, 'failNativeCompensationInvocation({', 'fenced failed completion')
contains(recovery, "code: 'COMPENSATION_ALREADY_IN_FLIGHT'", 'live-lease exclusion outcome')
contains(recovery, "code: 'COMPENSATION_EXECUTION_FENCED'", 'superseded worker outcome')
contains(recovery, 'assertNativeJsonContract(contract.output_schema, output', 'compensation output validation')
contains(recovery, 'const waveResults = await Promise.all(ready.map', 'ready-wave parallelism preserved')

assert.equal(
  recovery.includes("if (prior.status === 'RUNNING') return { decision: 'ESCALATE'"),
  false,
  'RUNNING compensation must be claimable so stale leases can recover after a crash',
)
assert.equal(
  recovery.includes('completeNativeToolInvocation({\n      invocationId'),
  false,
  'Recovery V2 compensation must not use ordinary unfenced completion',
)
assert.equal(
  recovery.includes('failNativeToolInvocation({\n        invocationId'),
  false,
  'Recovery V2 compensation must not use ordinary unfenced failure completion',
)

console.log('Native compensation crash reclaim and generation fencing verified.')
