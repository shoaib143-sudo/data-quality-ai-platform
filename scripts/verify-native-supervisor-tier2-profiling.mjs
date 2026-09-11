import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const service = readFileSync('lib/agents/runtime/native-supervisor-tier2-profiling.ts', 'utf8')
const route = readFileSync('app/api/agents/supervisor/tier2/profiling-snapshot/route.ts', 'utf8')
const executor = readFileSync('lib/agents/executors/profiling-executor.ts', 'utf8')
const replay = readFileSync('lib/profiling/replay-safe-tools.ts', 'utf8')

function has(source, token, label) {
  assert.ok(source.includes(token), `${label} missing: ${token}`)
}

has(service, "const TIER2_TOOL_KEY = 'persist_profile_snapshot'", 'single Tier 2 tool constant')
has(service, 'const TIER2_APPROVED_TOOLS = [TIER2_TOOL_KEY] as const', 'server-owned Tier 2 allowlist')
has(service, "allowTier2AutomaticExecution: true", 'Tier 2 policy enablement')
has(service, 'approvedTier2Tools: TIER2_APPROVED_TOOLS', 'bounded Tier 2 preapproval')
assert.equal(service.includes('approvedTier2Tools: input.'), false, 'Tier 2 preapproval must never come from request input')
assert.equal(service.includes('executeQualityAutomation'), false, 'Tier 2 profiling slice must not invoke the composite DQ workflow')

has(service, ".eq('agent_key', PROFILING_AGENT_KEY)", 'server-resolved profiling agent')
has(service, ".eq('version', PROFILING_AGENT_VERSION)", 'pinned profiling agent version')
has(service, ".eq('project_id', projectId)", 'profiling run project scope')
has(service, 'childLifecycle = await startNativeAgentLifecycle({', 'child manifest pinning')
has(service, 'bindNativePlanToPinnedRuntime({', 'plan runtime binding')
const childLifecycle = service.indexOf('childLifecycle = await startNativeAgentLifecycle({')
const planBinding = service.indexOf('bindNativePlanToPinnedRuntime({')
assert.ok(childLifecycle >= 0 && planBinding > childLifecycle, 'child runtime must be pinned before plan binding')

has(service, 'beginResumableRunStep(admin, {', 'real durable run step')
has(service, 'executeProfilingExecutor(TIER2_TOOL_KEY, toolInput, context)', 'exact profiling executor dispatch')
has(service, "stepName: TIER2_TOOL_KEY", 'run step is exact pinned tool')
has(service, "toolKey: TIER2_TOOL_KEY", 'native plan exact tool')
has(service, "agentKey: PROFILING_AGENT_KEY", 'native plan profiling worker')
has(service, 'evaluateNativeSupervisorTrajectory(supervisorRun.id)', 'terminal trajectory evaluation')
has(service, 'finishNativeAgentLifecycle({', 'terminal runtime checkpoint')

has(route, "authorizeProject(user.id, projectId, 'agent.execute')", 'project execution authorization')
has(route, 'runNativeTier2ProfilingSnapshot({', 'dedicated Tier 2 service call')
assert.equal(route.includes('toolKey'), false, 'Tier 2 endpoint must expose no caller-selectable tool key')
assert.equal(route.includes('approvedTier2Tools'), false, 'Tier 2 endpoint must expose no caller-selectable preapproval list')

has(executor, "case 'persist_profile_snapshot':", 'production profiling dispatcher mutation key')
has(executor, 'persistProfileSnapshotReplaySafe(toolInput)', 'replay-safe production mutation path')
has(replay, "rpc('persist_profile_snapshot_replay_safe'", 'atomic replay-safe RPC')

console.log('Controlled Tier 2 profiling supervisor verified.')
