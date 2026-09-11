import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const kernel = readFileSync('lib/agents/runtime/native-autonomy-kernel.ts', 'utf8')
const runtime = readFileSync('lib/agents/runtime/native-autonomy-runtime.ts', 'utf8')
const migration = readFileSync('supabase/migrations/20260911224500_native_autonomous_execution_kernel.sql', 'utf8')
const tests = readFileSync('scripts/test-native-autonomy-kernel.mjs', 'utf8')

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

contains(kernel, 'NATIVE_AUTONOMY_MAX_STEPS = 24', 'bounded planning')
contains(kernel, 'NATIVE_AUTONOMY_MAX_ATTEMPTS = 3', 'bounded recovery')
contains(kernel, 'certifyNativePinnedToolContract', 'pinned contract safety certification')
contains(kernel, "'approval_required'", 'approval contract binding')
contains(kernel, "'replay_certified'", 'replay certification')
contains(kernel, "'AUTO_TIER_0'", 'Tier 0 automatic execution')
contains(kernel, "'AUTO_TIER_1'", 'Tier 1 automatic execution')
contains(kernel, "'AUTO_TIER_2_PREAPPROVED'", 'Tier 2 pre-approved execution')
contains(kernel, "'APPROVAL_REQUIRED'", 'Tier 3 approval routing')
contains(kernel, "'PROHIBITED'", 'prohibited execution decision')
contains(kernel, 'getNativeDeterministicExecutionOrder', 'deterministic dependency scheduling')
contains(kernel, 'executeNativeClosedLoop', 'generic closed-loop execution')
contains(kernel, "recoveryDecision === 'RETRY'", 'bounded recovery retry')
contains(kernel, 'step.retryCertified', 'retry safety gate')

contains(runtime, 'bindNativePlanToPinnedRuntime', 'pinned runtime plan binding')
contains(runtime, 'getNativePinnedToolContract', 'pinned tool contract loading')
contains(runtime, 'manifest.agent_key !== input.agentKey', 'agent identity binding')
contains(runtime, 'run.project_id !== input.plan.projectId', 'project scope binding')
contains(runtime, 'recordNativeSupervisorEvent', 'supervisor evidence persistence')
contains(runtime, 'createNativeRuntimeCheckpoint', 'supervisor checkpoint persistence')
contains(runtime, 'requestNativeRuntimeInterrupt', 'exception-only approval interrupt')
contains(runtime, 'hashGovernedActionPayload(step.input)', 'exact approval payload binding')

contains(migration, 'CREATE TABLE agent.agent_supervisor_events', 'supervisor evidence table')
contains(migration, 'agent_supervisor_events_append_only', 'append-only supervisor evidence')
contains(migration, 'record_supervisor_event_internal', 'supervisor evidence RPC')
contains(migration, 'plan_hash text NOT NULL', 'plan hash evidence')
contains(migration, 'contract_hash text', 'contract hash evidence')
contains(migration, 'input_hash text', 'input hash evidence')
contains(migration, 'output_hash text', 'output hash evidence')
contains(migration, 'GRANT SELECT ON agent.agent_supervisor_events TO authenticated', 'project-readable governed evidence')
contains(migration, 'GRANT ALL ON agent.agent_supervisor_events TO service_role', 'service-only evidence mutation')
assert.equal(/\binput\s+jsonb\b/i.test(migration), false, 'supervisor evidence must not persist raw input JSON')
assert.equal(/\boutput\s+jsonb\b/i.test(migration), false, 'supervisor evidence must not persist raw output JSON')
assert.equal(/\bprompt\b/i.test(migration.replace(/--[^\n]*/g, '')), false, 'supervisor evidence schema must not persist prompts')

contains(tests, 'UNSAFE_RETRY_BLOCKED', 'unsafe retry regression test')
contains(tests, "status: 'WAITING_APPROVAL'", 'approval pause regression test')
contains(tests, 'replay certification requires read-only or idempotent execution', 'replay safety regression test')

console.log('Native DataNexus autonomous execution kernel contracts verified.')
