import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { pathToFileURL } from 'node:url'

async function transpileModule(sourcePath, outputName) {
  const source = await fs.readFile(sourcePath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), `${outputName}-`))
  const modulePath = path.join(dir, `${outputName}.mjs`)
  await fs.writeFile(modulePath, transpiled)
  return import(pathToFileURL(modulePath).href)
}

const { GovernedPolicyDecisionProvider } = await transpileModule(
  'lib/governance/policy-decision-provider.ts',
  'policy-decision-provider',
)
const { ObservablePolicyDecisionProvider } = await transpileModule(
  'lib/governance/observable-policy-decision-provider.ts',
  'observable-policy-decision-provider',
)
const { runWithTelemetryTraceContext, currentTelemetryTraceContext } = await transpileModule(
  'lib/ai/telemetry-trace-context-store.ts',
  'telemetry-trace-context-store',
)

const projectId = 'project-1'
const policy = {
  id: 'policy-1',
  project_id: projectId,
  action_key: 'CREATE_GOVERNANCE_ISSUE',
  enabled: true,
  execution_mode: 'AUTO',
  min_confidence: 0.75,
  max_auto_risk_level: 'MEDIUM',
  reversible: true,
  allowed_target_types: ['DATASET'],
  authority_status: 'SYSTEM_BASELINE',
  current_version_id: 'version-1',
}
const version = {
  id: 'version-1',
  project_id: projectId,
  policy_id: 'policy-1',
  version_number: 1,
  semantic_hash: 'hash',
  provenance: 'SYSTEM_BASELINE',
}

function providerWith({ policyRecord = policy, versionRecord = version } = {}) {
  return new GovernedPolicyDecisionProvider({
    async findPolicy() { return policyRecord },
    async findPolicyVersion() { return versionRecord },
  })
}

const baseRequest = {
  projectId,
  actionKey: 'CREATE_GOVERNANCE_ISSUE',
  targetType: 'DATASET',
  riskLevel: 'MEDIUM',
  confidence: 0.9,
}

assert.equal((await providerWith().decide(baseRequest)).decision, 'ALLOW')
assert.equal((await providerWith().decide(baseRequest)).policyVersionId, 'version-1')
assert.equal((await providerWith({ policyRecord: null }).decide(baseRequest)).decision, 'DENY')
assert.equal((await providerWith({ policyRecord: { ...policy, current_version_id: null } }).decide(baseRequest)).decision, 'DENY')
assert.equal((await providerWith({ versionRecord: { ...version, id: 'wrong-version' } }).decide(baseRequest)).decision, 'DENY')
assert.equal((await providerWith({ policyRecord: { ...policy, enabled: false } }).decide(baseRequest)).decision, 'DENY')
assert.equal((await providerWith({ policyRecord: { ...policy, execution_mode: 'BLOCKED' } }).decide(baseRequest)).decision, 'DENY')
assert.equal((await providerWith().decide({ ...baseRequest, targetType: 'SOURCE' })).decision, 'DENY')
assert.equal((await providerWith({ policyRecord: { ...policy, execution_mode: 'APPROVAL_REQUIRED' } }).decide(baseRequest)).decision, 'REQUIRE_APPROVAL')
assert.equal((await providerWith().decide({ ...baseRequest, confidence: 0.5 })).decision, 'REQUIRE_APPROVAL')
assert.equal((await providerWith().decide({ ...baseRequest, riskLevel: 'HIGH' })).decision, 'REQUIRE_APPROVAL')
assert.equal((await providerWith({ policyRecord: { ...policy, reversible: false } }).decide(baseRequest)).decision, 'REQUIRE_APPROVAL')
await assert.rejects(() => providerWith().decide({ ...baseRequest, projectId: '   ' }), /projectId is required/)
await assert.rejects(() => providerWith().decide({ ...baseRequest, confidence: 2 }), /confidence must be between 0 and 1/)

const traceContext = {
  traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
  parentSpanId: '00f067aa0ba902b7',
  traceFlags: '01',
  tracestate: 'vendor=policy-test',
}
const events = []
const observable = new ObservablePolicyDecisionProvider(
  providerWith(),
  {
    id: 'test-telemetry',
    async record(event) {
      events.push(event)
      return { eventId: 'telemetry-1', persisted: true }
    },
  },
  currentTelemetryTraceContext,
)

const observedResult = await runWithTelemetryTraceContext(traceContext, () => observable.decide(baseRequest))
assert.equal(observedResult.decision, 'ALLOW')
assert.equal(events.length, 1)
assert.equal(events[0].eventType, 'POLICY_DECISION')
assert.equal(events[0].operation, 'autonomy_policy_decision')
assert.equal(events[0].providerId, 'governance_autonomy_policy')
assert.deepEqual(events[0].traceContext, traceContext)
assert.equal(events[0].attributes.decision, 'ALLOW')
assert.equal(events[0].attributes.policy_id, 'policy-1')
assert.equal(events[0].attributes.policy_version_id, 'version-1')
assert.equal(events[0].attributes.execution_mode, 'AUTO')
assert.equal(currentTelemetryTraceContext(), null, 'request trace context must not leak after the async scope closes')

const telemetryFailureProvider = new ObservablePolicyDecisionProvider(
  providerWith({ policyRecord: { ...policy, execution_mode: 'BLOCKED' } }),
  { id: 'broken-telemetry', async record() { throw new Error('telemetry unavailable') } },
  () => traceContext,
)
const deniedDespiteTelemetryFailure = await telemetryFailureProvider.decide(baseRequest)
assert.equal(deniedDespiteTelemetryFailure.decision, 'DENY', 'telemetry failure must not change the governed PDP result')

console.log('ADR-006 PolicyDecisionProvider behavior verified.')
