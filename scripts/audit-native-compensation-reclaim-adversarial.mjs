import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260912104500_native_compensation_reclaim_fencing.sql', 'utf8')
const runningShapeFix = readFileSync('supabase/migrations/20260912110000_native_compensation_running_terminal_shape.sql', 'utf8')
const recovery = readFileSync('lib/agents/runtime/native-recovery-v2.ts', 'utf8')
const fencing = readFileSync('lib/agents/runtime/native-compensation-fencing.ts', 'utf8')

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

// Threat: two workers claim the same invocation concurrently.
contains(migration, 'FOR UPDATE;', 'claim row lock')
contains(migration, "'ACTIVE_LEASE'", 'live lease exclusion')
contains(migration, 'compensation_generation = v_invocation.compensation_generation + 1', 'monotonic stale reclaim generation')

// Threat: the new RUNNING compensation state conflicts with pre-existing invocation evidence shape checks.
contains(runningShapeFix, "status IN ('ADMITTED', 'RUNNING')", 'non-terminal RUNNING evidence shape')
contains(runningShapeFix, "status = 'SUCCEEDED'", 'successful terminal evidence shape preserved')
contains(runningShapeFix, "status IN ('FAILED', 'REJECTED')", 'failed/rejected terminal evidence shape preserved')
contains(runningShapeFix, 'completed_at IS NULL', 'non-terminal completion timestamp guard')
contains(runningShapeFix, 'output_hash IS NULL', 'non-terminal output hash guard')
contains(runningShapeFix, 'error_code IS NULL', 'non-terminal error-code guard')

// Threat: an obsolete worker writes terminal evidence after a newer worker reclaimed execution.
contains(migration, 'compensation_owner_id IS DISTINCT FROM p_owner_id', 'pre-completion owner fence')
contains(migration, 'compensation_generation IS DISTINCT FROM p_generation', 'pre-completion generation fence')
contains(migration, 'AND compensation_owner_id = p_owner_id', 'atomic terminal owner predicate')
contains(migration, 'AND compensation_generation = p_generation', 'atomic terminal generation predicate')
contains(migration, 'COMPENSATION_FENCED', 'explicit supersession failure')

// Threat: terminal evidence is reopened or silently rewritten.
contains(migration, "IF OLD.status IN ('SUCCEEDED','FAILED','REJECTED')", 'terminal immutability trigger')
contains(migration, "IF v_invocation.status IN ('SUCCEEDED','FAILED','REJECTED')", 'terminal claim rejection')
contains(migration, "IF v_invocation.status <> 'RUNNING'", 'terminal completion state guard')

// Threat: arbitrary native invocation is relabeled as compensation.
contains(migration, "v_invocation.idempotency_key NOT LIKE 'recovery:%'", 'recovery idempotency namespace guard')
contains(migration, "source.contract->'execution_config'->>'compensation_tool_key'", 'pinned manifest compensation binding')

// Threat: normal execution accidentally starts using the compensation-only path.
contains(recovery, 'claimNativeCompensationInvocation', 'Recovery V2 claim integration')
contains(recovery, 'completeNativeCompensationInvocation', 'Recovery V2 fenced success integration')
contains(recovery, 'failNativeCompensationInvocation', 'Recovery V2 fenced failure integration')
assert.equal(recovery.includes('completeNativeToolInvocation'), false, 'Recovery V2 must not bypass compensation fencing')
assert.equal(recovery.includes('failNativeToolInvocation'), false, 'Recovery V2 must not bypass compensation failure fencing')

// Threat: healthy long-running work is reclaimed solely because execution exceeds one lease period.
contains(recovery, 'withNativeCompensationLease', 'Recovery V2 heartbeat wrapper')
contains(fencing, 'NATIVE_COMPENSATION_HEARTBEAT_MS', 'lease heartbeat cadence')
contains(fencing, 'claim.generation !== input.generation', 'heartbeat generation check')
contains(fencing, 'claim.ownerId !== input.ownerId', 'heartbeat owner check')

// Threat: a transient heartbeat transport failure creates false terminal evidence.
contains(fencing, 'Transport failure is not terminal evidence', 'heartbeat transport failure policy')
contains(recovery, "'COMPENSATION_EXECUTION_FENCED'", 'superseded worker fail-closed outcome')

// Threat: compensation success is reported before persisted evidence is verified.
const fencedComplete = recovery.indexOf('completeNativeCompensationInvocation')
const persistedVerify = recovery.indexOf('verifyCompensationInvocation', fencedComplete)
assert.ok(fencedComplete >= 0 && persistedVerify > fencedComplete, 'persisted compensation verification must follow fenced completion')
contains(recovery, "data.status !== 'SUCCEEDED'", 'persisted terminal success verification')
contains(recovery, 'data.output_hash', 'persisted output hash verification')

console.log('Independent adversarial static audit for native compensation reclaim fencing passed.')
