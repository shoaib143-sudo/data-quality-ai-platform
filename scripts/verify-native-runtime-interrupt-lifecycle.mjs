import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260912052000_native_runtime_interrupt_lifecycle.sql', 'utf8')
const processor = readFileSync('lib/agents/runtime/native-runtime-interrupt-lifecycle.ts', 'utf8')
const worker = readFileSync('app/api/jobs/worker/route.ts', 'utf8')

const migrationInvariants = [
  'CREATE TABLE agent.agent_run_interrupt_terminal_actions',
  'CREATE TABLE agent.agent_run_interrupt_late_decisions',
  "CHECK (action IN ('ESCALATED','CANCELLED'))",
  "CHECK (source IN ('TIMEOUT','REJECTION'))",
  'Agent runtime interrupt terminal evidence is append-only',
  'process_expired_runtime_interrupt_internal',
  "v_interrupt.status = 'PENDING'",
  "v_interrupt.status <> 'EXPIRED'",
  "v_interrupt.interrupt_type IN ('HUMAN_APPROVAL','MANUAL_REVIEW') THEN 'ESCALATED'",
  "ELSE 'CANCELLED'",
  "status = 'CANCELLED'::agent.run_status",
  'cancelled_at = COALESCE(cancelled_at, now())',
  'INTERRUPT_TIMEOUT_ESCALATED',
  'INTERRUPT_TIMEOUT_CANCELLED',
  'INTERRUPT_REJECTED_BY_HUMAN',
  "v_interrupt.status IN ('EXPIRED','CANCELLED')",
  'INSERT INTO agent.agent_run_interrupt_late_decisions',
  "v_interrupt.decision <> 'APPROVED'",
  'Terminal interrupt cannot be resumed',
  'pg_advisory_xact_lock',
]
for (const fragment of migrationInvariants) {
  assert.ok(migration.includes(fragment), `missing interrupt lifecycle invariant: ${fragment}`)
}

assert.match(migration, /REVOKE ALL ON FUNCTION agent\.process_expired_runtime_interrupt_internal\(uuid\) FROM public, anon, authenticated/)
assert.match(migration, /GRANT EXECUTE ON FUNCTION agent\.process_expired_runtime_interrupt_internal\(uuid\) TO service_role/)
assert.match(migration, /CREATE POLICY agent_run_interrupt_terminal_actions_project_read[\s\S]*app_private\.is_project_member/)
assert.match(migration, /CREATE POLICY agent_run_interrupt_late_decisions_project_read[\s\S]*app_private\.is_project_member/)
assert.match(migration, /IF v_interrupt\.status <> 'RESOLVED' OR v_interrupt\.decision <> 'APPROVED' THEN[\s\S]*must be APPROVED before resume/)
assert.match(migration, /IF v_decision = 'REJECTED' THEN[\s\S]*status = 'CANCELLED'::agent\.run_status[\s\S]*INTERRUPT_REJECTED_BY_HUMAN/)

const processorInvariants = [
  'processExpiredNativeRuntimeInterrupt',
  'processDueNativeRuntimeInterrupts',
  ".eq('status', 'PENDING')",
  ".not('expires_at', 'is', null)",
  ".lte('expires_at', now)",
  "rpc('process_expired_runtime_interrupt_internal'",
  "terminalAction === 'ESCALATED'",
  "terminalAction === 'CANCELLED'",
]
for (const fragment of processorInvariants) {
  assert.ok(processor.includes(fragment), `missing timeout processor invariant: ${fragment}`)
}

assert.ok(!processor.includes('timeoutAction'), 'timeout terminal action must not be supplied by a caller')
assert.ok(!processor.includes('approvalInterruptId'), 'timeout processing must not manufacture approval authority')
assert.match(worker, /processDueNativeRuntimeInterrupts\(50\)/)
assert.match(worker, /nativeRuntimeInterrupts/)
assert.match(worker, /isAuthorizedWorkerRequest/)

console.log('native runtime interrupt lifecycle verification passed')
