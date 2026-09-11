import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const migrationPath = path.join(root, 'supabase/migrations/20260911205000_native_runtime_contract_pinning.sql')
const contractsPath = path.join(root, 'lib/agents/runtime/native-tool-contracts.ts')
const runtimePath = path.join(root, 'lib/agents/runtime/native-agent-runtime-state.ts')
const executorPath = path.join(root, 'lib/agents/executors/profiling-executor.ts')

for (const file of [migrationPath, contractsPath, runtimePath, executorPath]) {
  if (!fs.existsSync(file)) throw new Error(`Missing native runtime contract file: ${path.relative(root, file)}`)
}

const migration = fs.readFileSync(migrationPath, 'utf8')
const contracts = fs.readFileSync(contractsPath, 'utf8')
const runtime = fs.readFileSync(runtimePath, 'utf8')
const executor = fs.readFileSync(executorPath, 'utf8')

const requiredMigrationSnippets = [
  'CREATE TABLE agent.agent_run_runtime_manifests',
  'CREATE TABLE agent.agent_tool_invocations',
  'definition_snapshot jsonb NOT NULL',
  'tool_contracts jsonb NOT NULL',
  'runtime_version text NOT NULL',
  'agent_run_runtime_manifests_append_only',
  'agent_tool_invocations_transition_guard',
  'CREATE OR REPLACE FUNCTION agent.ensure_runtime_manifest_internal',
  'Runtime version drift: run is pinned to %',
  'Multiple enabled versions exist for tool %',
  "extensions.digest(v_definition_snapshot::text, 'sha256')",
  'CREATE OR REPLACE FUNCTION agent.admit_tool_invocation_internal',
  'Pinned agent definition is currently disabled',
  'Pinned tool has been administratively disabled',
  'Native runtime rejects non-idempotent side effects without explicit approval_required',
  'Tool approval does not match the exact pinned invocation',
  'Tool invocation idempotency key collision',
  'CREATE OR REPLACE FUNCTION agent.complete_tool_invocation_internal',
  'Successful tool invocation requires an output sha256 digest',
  'Source agent run has no pinned runtime manifest and cannot be replayed exactly',
  'PERFORM agent.copy_runtime_manifest_internal(p_source_agent_run_id, v_replay_run_id)',
  'Agent run must have a pinned runtime manifest before an interrupt can be requested',
  'Agent run has no pinned runtime manifest',
  'REVOKE ALL ON agent.agent_run_runtime_manifests FROM public, anon, authenticated',
  'REVOKE ALL ON agent.agent_tool_invocations FROM public, anon, authenticated',
  'GRANT SELECT ON agent.agent_tool_invocations TO authenticated',
  'REVOKE ALL ON FUNCTION agent.ensure_runtime_manifest_internal(uuid,text) FROM public, anon, authenticated',
  'REVOKE ALL ON FUNCTION agent.admit_tool_invocation_internal(uuid,text,text,text,text,uuid) FROM public, anon, authenticated',
]
for (const snippet of requiredMigrationSnippets) {
  if (!migration.includes(snippet)) throw new Error(`Native runtime migration is missing contract: ${snippet}`)
}

if (/GRANT\s+SELECT\s+ON\s+agent\.agent_run_runtime_manifests\s+TO\s+authenticated/i.test(migration)) {
  throw new Error('Private runtime manifests must not be exposed to authenticated browser roles')
}
if (/\b(input|output)\s+jsonb\b/i.test(migration.match(/CREATE TABLE agent\.agent_tool_invocations[\s\S]*?\);/)?.[0] ?? '')) {
  throw new Error('Tool invocation evidence must not persist raw input/output JSON')
}

const requiredContractSnippets = [
  'SUPPORTED_SCHEMA_KEYWORDS',
  "'uuid'",
  "'date-time'",
  'assertNativeJsonContract',
  'normalizeNativeToolContractInput',
  'Exact names win',
  'ensureNativeRuntimeManifest',
  'getNativeRuntimeVersion',
  'DATANEXUS_RUNTIME_VERSION',
  'VERCEL_GIT_COMMIT_SHA',
  'RENDER_GIT_COMMIT',
  'getNativePinnedToolContract',
  'admitNativeToolInvocation',
  'completeNativeToolInvocation',
  'failNativeToolInvocation',
  'duplicate execution is blocked',
  "p_status: 'SUCCEEDED'",
  "p_status: 'FAILED'",
]
for (const snippet of requiredContractSnippets) {
  if (!contracts.includes(snippet)) throw new Error(`Native tool guardrail is missing contract: ${snippet}`)
}

const requiredExecutorSnippets = [
  'admitNativeToolInvocation',
  'expectedExecutor: EXECUTOR_KEY',
  'const toolInput = admission.toolInput',
  'completeNativeToolInvocation',
  'failNativeToolInvocation',
  'contractHash: admission.contract.contract_hash',
]
for (const snippet of requiredExecutorSnippets) {
  if (!executor.includes(snippet)) throw new Error(`Profiling executor is missing native guardrail: ${snippet}`)
}

for (const functionName of [
  'createNativeRuntimeCheckpoint',
  'requestNativeRuntimeInterrupt',
  'resumeNativeRuntimeInterrupt',
  'createNativeRuntimeReplay',
]) {
  const index = runtime.indexOf(`export async function ${functionName}`)
  if (index < 0) throw new Error(`Missing runtime function: ${functionName}`)
  const next = runtime.indexOf('\nexport async function ', index + 1)
  const body = runtime.slice(index, next < 0 ? runtime.length : next)
  if (!body.includes('ensureNativeRuntimeManifest')) {
    throw new Error(`${functionName} must verify/pin the runtime manifest`)
  }
}

console.log('Native runtime manifest pinning and deterministic tool guardrails verified.')
