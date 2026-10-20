import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20261020070000_terminalize_learning_experiment_dispatch.sql', 'utf8')
const runner = fs.readFileSync('lib/agents/learning-experiment-runner.ts', 'utf8')
const store = fs.readFileSync('lib/agents/learning-experiment-runner-store.ts', 'utf8')

assert.match(migration, /p_status not in \('failed', 'cancelled'\)/i)
assert.match(migration, /pg_advisory_xact_lock\(hashtextextended\(p_claim_id::text, 0\)\)/i)
assert.match(migration, /v_existing\.status = p_status and v_existing\.failure_reason = left\(btrim\(p_reason\), 240\)/i)
assert.match(migration, /insert into agent\.learning_experiment_dispatch_outcomes\(claim_id, status, failure_reason\)/i)
assert.match(migration, /grant execute on function agent\.terminalize_learning_experiment_dispatch\(uuid, text, text\)\s+to service_role/i)
assert.match(runner, /terminalizeDispatch\(claimId: string, status: 'failed' \| 'cancelled'/)
assert.match(runner, /pendingTerminal = \{ status: 'cancelled', reason: 'RUNNER_CANCELLED_AFTER_CLAIM' \}[\s\S]*?terminalizeDispatch\(claim\.claimId, pendingTerminal\.status, pendingTerminal\.reason\)/)
assert.match(runner, /terminalizeDispatch\(activeClaimId, terminalStatus, terminalReason\)/)
assert.match(store, /rpc\('terminalize_learning_experiment_dispatch'/)

console.log('PASS acquired dispatches persist failed/cancelled terminal evidence and cannot be silently retried')
console.log('NOTE SQL was statically checked only. No PostgreSQL or Supabase migration was run.')
