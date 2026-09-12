import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync('supabase/migrations/20260912043000_native_supervisor_durable_resume.sql', 'utf8')
const runtime = readFileSync('lib/agents/runtime/native-supervisor-resume.ts', 'utf8')

const requiredMigrationFragments = [
  'CREATE TABLE agent.agent_run_execution_leases',
  'plan_hash text NOT NULL',
  'runtime_manifest_hash text NOT NULL',
  'tool_contracts_hash text NOT NULL',
  'execution_generation bigint NOT NULL DEFAULT 0',
  'resume_attempt bigint NOT NULL DEFAULT 0',
  'pg_advisory_xact_lock',
  'Pinned runtime manifest mismatch',
  'Pinned supervisor plan mismatch',
  'Pinned supervisor tool contract bundle mismatch',
  'Supervisor execution is leased by another worker',
  "v_run_status = 'WAITING'::agent.run_status",
  'lease_expires_at <= now()',
  'execution_generation=p_execution_generation',
]
for (const fragment of requiredMigrationFragments) {
  assert.ok(migration.includes(fragment), `missing durable-resume migration invariant: ${fragment}`)
}

assert.match(migration, /Terminal agent run cannot be claimed/)
assert.match(migration, /Approval-waiting agent run cannot be resumed by an execution lease/)
assert.match(migration, /Supervisor execution pins are immutable/)
assert.match(migration, /checkpoint_id, agent_run_id[\s\S]*agent_run_checkpoints\(id, agent_run_id\)/)
assert.match(migration, /REVOKE ALL ON FUNCTION agent\.claim_supervisor_execution_internal[\s\S]*FROM public,anon,authenticated/)
assert.match(migration, /GRANT EXECUTE ON FUNCTION agent\.claim_supervisor_execution_internal[\s\S]*TO service_role/)

const requiredRuntimeFragments = [
  'buildNativeSupervisorExecutionPins',
  'claimNativeSupervisorExecution',
  'renewNativeSupervisorExecution',
  'releaseNativeSupervisorExecution',
  '.sort((left, right) => left.stepId.localeCompare(right.stepId))',
  "select('manifest_hash')",
  'p_execution_generation: input.executionGeneration',
]
for (const fragment of requiredRuntimeFragments) {
  assert.ok(runtime.includes(fragment), `missing durable-resume runtime invariant: ${fragment}`)
}

assert.ok(!runtime.includes('allowTier2AutomaticExecution'), 'resume ownership must not widen Tier 2 autonomy')
assert.ok(!runtime.includes('approvalInterruptId'), 'resume ownership must not manufacture approval authority')

console.log('native supervisor durable resume verification passed')
