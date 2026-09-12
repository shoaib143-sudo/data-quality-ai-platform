import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260912054000_native_interrupt_timeout_lifecycle.sql', 'utf8')
const runtime = readFileSync('lib/agents/runtime/native-interrupt-lifecycle.ts', 'utf8')

const requiredMigrationFragments = [
  'CREATE TABLE agent.agent_run_interrupt_events',
  'UNIQUE (interrupt_id, event_type)',
  'Agent runtime interrupt events are append-only',
  'CREATE OR REPLACE FUNCTION agent.process_runtime_interrupt_timeout_internal',
  'CREATE OR REPLACE FUNCTION agent.cancel_runtime_interrupt_internal',
  'FOR UPDATE',
  "IF v_interrupt.status <> 'PENDING' THEN",
  'v_interrupt.expires_at IS NULL OR v_interrupt.expires_at > v_now',
  "v_run_status <> 'WAITING'::agent.run_status",
  "SET status = 'EXPIRED'",
  "'INTERRUPT_TIMED_OUT'",
  "'INTERRUPT_ESCALATED'",
  "SET status = 'CANCELLED'",
  "status = 'CANCELLED'::agent.run_status",
  "'INTERRUPT_CANCELLED'",
  "'RUN_CANCELLED'",
  "'LATE_DECISION_REJECTED'",
  "'timeout_handling', 'ESCALATE'",
  'Agent runtime interrupt is not pending',
]
for (const fragment of requiredMigrationFragments) {
  assert.ok(migration.includes(fragment), `missing interrupt lifecycle invariant: ${fragment}`)
}

assert.match(migration, /CREATE OR REPLACE FUNCTION agent\.process_runtime_interrupt_timeout_internal[\s\S]*IF v_interrupt\.status <> 'PENDING'[\s\S]*IF v_interrupt\.expires_at IS NULL OR v_interrupt\.expires_at > v_now[\s\S]*SET status = 'EXPIRED'/)
assert.match(migration, /CREATE OR REPLACE FUNCTION agent\.cancel_runtime_interrupt_internal[\s\S]*IF v_interrupt\.status = 'CANCELLED'[\s\S]*IF v_interrupt\.status <> 'PENDING'[\s\S]*SET status = 'CANCELLED'/)
assert.match(migration, /CREATE OR REPLACE FUNCTION agent\.resolve_runtime_interrupt[\s\S]*expires_at <= v_now[\s\S]*LATE_DECISION_REJECTED[\s\S]*RETURN QUERY SELECT p_interrupt_id, 'EXPIRED'::text, NULL::text/)
assert.match(migration, /REVOKE ALL ON FUNCTION agent\.process_runtime_interrupt_timeout_internal\(uuid,text\) FROM public, anon, authenticated/)
assert.match(migration, /REVOKE ALL ON FUNCTION agent\.cancel_runtime_interrupt_internal\(uuid,text\) FROM public, anon, authenticated/)
assert.match(migration, /GRANT EXECUTE ON FUNCTION agent\.process_runtime_interrupt_timeout_internal\(uuid,text\) TO service_role/)
assert.match(migration, /GRANT EXECUTE ON FUNCTION agent\.cancel_runtime_interrupt_internal\(uuid,text\) TO service_role/)

const requiredRuntimeFragments = [
  'processNativeRuntimeInterruptTimeout',
  'cancelNativeRuntimeInterrupt',
  'getNativeRuntimeInterruptEvents',
  "rpc('process_runtime_interrupt_timeout_internal'",
  "rpc('cancel_runtime_interrupt_internal'",
  "from('agent_run_interrupt_events')",
  'INTERRUPT_TIMED_OUT',
  'INTERRUPT_ESCALATED',
  'LATE_DECISION_REJECTED',
]
for (const fragment of requiredRuntimeFragments) {
  assert.ok(runtime.includes(fragment), `missing interrupt runtime invariant: ${fragment}`)
}

assert.ok(!runtime.includes('allowTier2AutomaticExecution'), 'interrupt automation must not widen Tier 2 autonomy')
assert.ok(!runtime.includes('resolve_runtime_interrupt'), 'server timeout helpers must not impersonate human approval')
assert.ok(!migration.includes("SET status = 'RUNNING'"), 'timeout/cancel automation must never silently resume a run')
assert.ok(!migration.includes("decision = 'APPROVED'"), 'timeout/cancel automation must never manufacture approval')

console.log('native interrupt timeout lifecycle verification passed')
