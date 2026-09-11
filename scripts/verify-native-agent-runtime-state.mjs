import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migrationPath = path.join(root, 'supabase/migrations/20260911204000_native_agent_runtime_state.sql')
const runtimePath = path.join(root, 'lib/agents/runtime/native-agent-runtime-state.ts')
const routePath = path.join(root, 'app/api/agents/runtime/interrupts/[interruptId]/route.ts')

for (const file of [migrationPath, runtimePath, routePath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing native agent runtime state file: ${path.relative(root, file)}`)
}

const migration = fs.readFileSync(migrationPath, 'utf8')
const runtime = fs.readFileSync(runtimePath, 'utf8')
const route = fs.readFileSync(routePath, 'utf8')

const requiredMigrationSnippets = [
  'CREATE TABLE agent.agent_run_checkpoints',
  'CREATE TABLE agent.agent_run_interrupts',
  'CREATE TABLE agent.agent_run_replays',
  'checkpoint_kind IN (\'STEP_BOUNDARY\',\'PAUSE\',\'RESUME\',\'REPLAY_SOURCE\',\'TERMINAL\')',
  "status IN ('PENDING','RESOLVED','RESUMED','CANCELLED','EXPIRED')",
  "decision IS NULL OR decision IN ('APPROVED','REJECTED')",
  'agent_run_interrupts_human_action_hash_check',
  'agent_run_checkpoints_append_only',
  'agent_run_replays_append_only',
  'agent_run_interrupts_transition_guard',
  'pg_catalog.pg_advisory_xact_lock',
  "extensions.digest(p_state::text, 'sha256')",
  "SET status = 'WAITING'::agent.run_status",
  "SET status = 'RUNNING'::agent.run_status",
  "'CREATED'::agent.run_status",
  'parent_run_id, correlation_id, status, input',
  'CREATE OR REPLACE FUNCTION agent.resolve_runtime_interrupt',
  'Project administrator approval is required',
  'Approval payload does not match the pending action',
  'Interrupt idempotency key collision',
  'Replay idempotency key collision',
  'REVOKE ALL ON FUNCTION agent.create_runtime_checkpoint_internal',
  'REVOKE ALL ON FUNCTION agent.request_runtime_interrupt_internal',
  'REVOKE ALL ON FUNCTION agent.resume_runtime_interrupt_internal',
  'REVOKE ALL ON FUNCTION agent.create_runtime_replay_internal',
  'GRANT EXECUTE ON FUNCTION agent.resolve_runtime_interrupt',
]

for (const snippet of requiredMigrationSnippets) {
  if (!migration.includes(snippet)) throw new Error(`Native runtime migration is missing contract: ${snippet}`)
}

const forbiddenMigrationPatterns = [
  /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE).*agent_run_checkpoints.*authenticated/is,
  /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE).*agent_run_interrupts.*authenticated/is,
  /GRANT\s+(?:ALL|INSERT|UPDATE|DELETE).*agent_run_replays.*authenticated/is,
]
for (const pattern of forbiddenMigrationPatterns) {
  if (pattern.test(migration)) throw new Error(`Native runtime migration exposes a browser mutation grant: ${pattern}`)
}

const requiredRuntimeSnippets = [
  "export type NativeAgentRuntimeStateV1",
  "version: '1.0'",
  'evidenceRefs?: NativeRuntimeEvidenceRef[]',
  'memoryRefs?: string[]',
  'pendingAction?: NativeRuntimePendingAction',
  'hashGovernedActionPayload',
  "createHash('sha256')",
  'createNativeRuntimeCheckpoint',
  'requestNativeRuntimeInterrupt',
  'resumeNativeRuntimeInterrupt',
  'createNativeRuntimeReplay',
  'getNativeRuntimeCheckpointHistory',
  "HUMAN_APPROVAL requires an exact action payload hash",
]
for (const snippet of requiredRuntimeSnippets) {
  if (!runtime.includes(snippet)) throw new Error(`Native runtime TypeScript contract is missing: ${snippet}`)
}

const forbiddenStateKeys = [
  'chainOfThought',
  'chain_of_thought',
  'hiddenReasoning',
  'rawPrompt',
  'rawCompletion',
  'credential',
  'connectionString',
]
for (const key of forbiddenStateKeys) {
  const stateTypeStart = runtime.indexOf('export type NativeAgentRuntimeStateV1')
  const stateTypeEnd = runtime.indexOf('\n}\n', stateTypeStart)
  const stateType = runtime.slice(stateTypeStart, stateTypeEnd + 3)
  if (stateType.includes(key)) throw new Error(`Checkpoint state must not expose forbidden field: ${key}`)
}

const requiredRouteSnippets = [
  'requireApiUser()',
  "authorizeProject(user.id, agentRun.project_id, 'agent.execute')",
  "decision must be APPROVED or REJECTED",
  'Approval payload does not match the pending action',
  "rpc('resolve_runtime_interrupt'",
]
for (const snippet of requiredRouteSnippets) {
  if (!route.includes(snippet)) throw new Error(`Native runtime interrupt API is missing governance contract: ${snippet}`)
}

if (route.includes('createAdminClient')) {
  throw new Error('Human interrupt decisions must not bypass authenticated user context with the service-role client')
}

console.log('Native agent runtime checkpoint, interrupt, and replay contracts verified.')
