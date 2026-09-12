import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const recovery = readFileSync('lib/agents/runtime/native-recovery-v2.ts', 'utf8')
const runtime = readFileSync('lib/agents/runtime/native-autonomy-runtime.ts', 'utf8')
const fencing = readFileSync('lib/agents/runtime/native-compensation-fencing.ts', 'utf8')

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

contains(recovery, 'executeNativeClosedLoopV2', 'Recovery V2 closed loop')
contains(recovery, 'recoverNativeStepV2', 'Recovery V2 step recovery')
contains(recovery, 'retryable_error_codes', 'explicit retry error certification')
contains(recovery, 'replayCertifiedFromPinnedContract', 'pinned replay certification derivation')
contains(recovery, 'resolveAgentRunId', 'per-step pinned child run resolution')
contains(recovery, "'FAILED_STEP_CONTRACT_HASH_MISSING'", 'missing contract hash fail closed')
contains(recovery, "'FAILED_STEP_CONTRACT_DRIFT'", 'failed-step contract drift guard')
contains(recovery, "'FAILED_STEP_EXECUTOR_DRIFT'", 'failed-step executor drift guard')
contains(recovery, 'validateNativeBoundedPlan', 'compensation plan validation')
contains(recovery, 'admitNativeToolInvocation', 'native compensation admission')
contains(recovery, 'claimNativeCompensationInvocation', 'native compensation lease claim')
contains(recovery, 'withNativeCompensationLease', 'native compensation lease heartbeat')
contains(recovery, 'completeNativeCompensationInvocation', 'fenced native compensation completion')
contains(recovery, 'failNativeCompensationInvocation', 'fenced native compensation failure')
contains(recovery, 'verifyCompensationInvocation', 'compensation evidence verification')
contains(recovery, "'COMPENSATION_REPLAY_CONTRACT_DRIFT'", 'compensation replay contract drift guard')
contains(recovery, "'COMPENSATION_REPLAY_INPUT_DRIFT'", 'compensation replay input drift guard')
contains(recovery, "'COMPENSATION_ALREADY_IN_FLIGHT'", 'in-flight compensation replay guard')
contains(recovery, "'COMPENSATION_PREVIOUSLY_FAILED'", 'failed compensation replay guard')
contains(recovery, "'COMPENSATION_EXECUTION_FENCED'", 'superseded compensation worker guard')
contains(recovery, '.select(\'id,agent_run_id,tool_key,contract_hash,input_hash,status,output_hash\')', 'verified compensation evidence fields')
contains(recovery, 'hashNativeRuntimeValue(toolInput)', 'compensation input hash binding')
contains(recovery, "'RECOVERY_ENGINE_FAILED'", 'recovery engine fail-closed result')
contains(recovery, "'STEP_FAILED_VERIFIED_COMPENSATION'", 'verified compensation terminal result')

contains(fencing, 'claim_compensation_tool_invocation_internal', 'compensation claim RPC binding')
contains(fencing, 'complete_compensation_tool_invocation_internal', 'compensation fenced completion RPC binding')
contains(fencing, 'claim.generation !== input.generation', 'heartbeat generation fence')
contains(fencing, 'claim.ownerId !== input.ownerId', 'heartbeat owner fence')

contains(runtime, 'executeNativeClosedLoopV2', 'production supervisor Recovery V2 adoption')
contains(runtime, 'resolveAgentRunId: (step) => getBinding(step).agentRunId', 'child run recovery binding')
contains(runtime, 'policy: boundPlan.policy', 'validated autonomy policy reuse')
contains(runtime, 'executeCompensation:', 'governed compensation executor binding')
contains(runtime, 'buildCompensationInput:', 'governed compensation input binding')
assert.equal(runtime.includes('type NativeRecoveryDecision'), false, 'production runtime must not expose legacy recovery decisions')
assert.equal(runtime.includes('recover?('), false, 'production runtime must not expose legacy recovery callback')
assert.equal(recovery.includes('completeNativeToolInvocation'), false, 'Recovery V2 compensation must not bypass fenced completion')

assert.equal(
  /recover\?\s*\([^)]*\).*NativeRecoveryDecision/s.test(recovery),
  false,
  'Recovery V2 must not accept the legacy caller-supplied recovery decision callback',
)

function sourceFiles(root) {
  const output = []
  for (const name of readdirSync(root)) {
    const path = join(root, name)
    const stat = statSync(path)
    if (stat.isDirectory()) output.push(...sourceFiles(path))
    else if (/\.(?:ts|tsx)$/.test(name)) output.push(path)
  }
  return output
}

const legacyCallers = []
for (const root of ['lib', 'app']) {
  for (const path of sourceFiles(root)) {
    const repoPath = relative('.', path).replaceAll('\\', '/')
    if (repoPath === 'lib/agents/runtime/native-autonomy-kernel.ts') continue
    const source = readFileSync(path, 'utf8')
    if (/\bexecuteNativeClosedLoop\s*\(/.test(source)) legacyCallers.push(repoPath)
  }
}
assert.deepEqual(
  legacyCallers,
  [],
  `Legacy native recovery loop must not gain production callers: ${legacyCallers.join(', ')}`,
)

console.log('Native Recovery V2 governance contracts verified.')
