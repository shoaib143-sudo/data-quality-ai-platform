import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const lifecycle = readFileSync('lib/agents/runtime/native-agent-lifecycle.ts', 'utf8')
const dataQualityQueue = readFileSync('lib/data-quality/queue.ts', 'utf8')
const profilingExecutor = readFileSync('lib/agents/executors/profiling-executor.ts', 'utf8')
const specialistExecutor = readFileSync('lib/agents/governance-specialist-agent.ts', 'utf8')
const governedRegistry = readFileSync('lib/agents/governed-agent-registry.ts', 'utf8')

function contains(source, token, label) {
  assert.ok(source.includes(token), `${label} is missing: ${token}`)
}

contains(lifecycle, 'ensureNativeRuntimeManifest', 'shared lifecycle manifest pinning')
contains(lifecycle, "kind: 'STEP_BOUNDARY'", 'shared lifecycle step checkpoint')
contains(lifecycle, "kind: 'TERMINAL'", 'shared lifecycle terminal checkpoint')
contains(lifecycle, "domain: 'native_runtime_output_hash'", 'hash-only terminal output evidence')
contains(lifecycle, 'hashNativeRuntimeValue(input.output)', 'deterministic output hash')

contains(dataQualityQueue, 'startNativeAgentLifecycle', 'Data Quality native runtime adoption')
contains(dataQualityQueue, "phase: 'QUEUED'", 'Data Quality pre-execution checkpoint')
contains(dataQualityQueue, "domain: 'dataset_version'", 'Data Quality dataset evidence reference')
contains(dataQualityQueue, "domain: 'profile_run'", 'Data Quality profile evidence reference')
contains(dataQualityQueue, 'await enqueueDurableJob', 'Data Quality durable queue')
assert.ok(
  dataQualityQueue.indexOf('await startNativeAgentLifecycle') < dataQualityQueue.indexOf('await enqueueDurableJob'),
  'Data Quality runtime manifest/checkpoint must be pinned before durable queue admission',
)

contains(profilingExecutor, 'admitNativeToolInvocation', 'Profiling native tool admission')
contains(profilingExecutor, 'completeNativeToolInvocation', 'Profiling native tool completion')
contains(profilingExecutor, 'failNativeToolInvocation', 'Profiling native tool failure evidence')

contains(specialistExecutor, 'startNativeAgentLifecycle', 'specialist native runtime lifecycle')
contains(specialistExecutor, 'admitNativeToolInvocation', 'specialist native tool admission')
contains(specialistExecutor, 'completeNativeToolInvocation', 'specialist native tool completion')
contains(specialistExecutor, 'failNativeToolInvocation', 'specialist native tool failure evidence')
contains(specialistExecutor, "toolKey: 'governance_specialist_investigate'", 'specialist pinned tool key')
contains(specialistExecutor, "expectedExecutor: 'governance-specialist-agent'", 'specialist exact executor binding')
assert.ok(
  specialistExecutor.indexOf('await startNativeAgentLifecycle') < specialistExecutor.indexOf('await admitNativeToolInvocation'),
  'Specialist runtime lifecycle must be pinned before native tool admission',
)
assert.ok(
  specialistExecutor.indexOf('await admitNativeToolInvocation') < specialistExecutor.indexOf('const [projectResult, ctx, knowledgeMatches] = await Promise.all'),
  'Specialist native tool admission must happen before evidence collection',
)

const specialistToolOccurrences = governedRegistry.match(/governance_specialist_investigate/g) ?? []
assert.equal(specialistToolOccurrences.length, 6, 'All six governance specialist allowlists must include the pinned specialist tool')
for (const toolKey of ['sync_quality_rules', 'execute_quality_rules', 'publish_quality_results']) {
  contains(governedRegistry, `'${toolKey}'`, `Data Quality governed allowlist ${toolKey}`)
}

console.log('Native runtime adoption verified: profiling guarded, Data Quality pinned before queue, and all six governance specialists admitted before evidence collection.')
