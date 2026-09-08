import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import ts from 'typescript'
import { pathToFileURL } from 'node:url'

const source = await fs.readFile('lib/governance/policy-decision-provider.ts', 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'policy-decision-provider-'))
const modulePath = path.join(dir, 'policy-decision-provider.mjs')
await fs.writeFile(modulePath, transpiled)
const { GovernedPolicyDecisionProvider } = await import(pathToFileURL(modulePath).href)

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

console.log('ADR-006 PolicyDecisionProvider behavior verified.')
