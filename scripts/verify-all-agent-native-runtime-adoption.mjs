import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const lifecycle = readFileSync('lib/agents/runtime/native-agent-lifecycle.ts', 'utf8')
const dataQualityQueue = readFileSync('lib/data-quality/queue.ts', 'utf8')
const profilingExecutor = readFileSync('lib/agents/executors/profiling-executor.ts', 'utf8')
const specialistExecutor = readFileSync('lib/agents/governance-specialist-agent.ts', 'utf8')

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

// This verifier intentionally keeps the remaining specialist gap explicit until the
// specialist executor itself pins the runtime before evidence collection and admits a
// truthful specialist tool contract. Post-execution pinning is not accepted as adoption.
assert.equal(
  specialistExecutor.includes('startNativeAgentLifecycle'),
  false,
  'Remove this assertion only when specialist runtime adoption is implemented inside the executor',
)

console.log('Native runtime adoption foundation verified: profiling guarded, Data Quality pinned before queue, specialist gap remains explicit.')
