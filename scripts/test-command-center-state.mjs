import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import ts from 'typescript'
import { pathToFileURL } from 'node:url'

const sourcePath = path.resolve('lib/ai/command-center-state.ts')
const source = await fs.readFile(sourcePath, 'utf8')
const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'command-center-state-'))
const modulePath = path.join(dir, 'command-center-state.mjs')
await fs.writeFile(modulePath, transpiled)
const { GovernedCommandCenterState } = await import(pathToFileURL(modulePath).href)

const projectId = 'project-1'
const state = new GovernedCommandCenterState({
  async listAiSystems() {
    return [
      { id: 'sys-1', project_id: projectId, system_key: 'router', name: 'Router', system_type: 'ROUTER', lifecycle_status: 'DRAFT', current_version_id: null },
    ]
  },
  async listAutonomyPolicies() {
    return [
      { id: 'p-auto', project_id: projectId, action_key: 'auto-action', enabled: true, execution_mode: 'AUTO', min_confidence: '0.9', max_auto_risk_level: 'HIGH', reversible: false, authority_status: 'SYSTEM_BASELINE', reviewed_by: null, reviewed_at: null, current_version_id: 'pv-1' },
      { id: 'p-approval', project_id: projectId, action_key: 'approval-action', enabled: true, execution_mode: 'APPROVAL_REQUIRED', min_confidence: '0.8', max_auto_risk_level: 'LOW', reversible: true, authority_status: 'APPROVED', reviewed_by: 'user-1', reviewed_at: '2026-09-08T00:00:00Z', current_version_id: 'pv-2' },
      { id: 'p-blocked', project_id: projectId, action_key: 'blocked-action', enabled: false, execution_mode: 'BLOCKED', min_confidence: '1', max_auto_risk_level: 'LOW', reversible: true, authority_status: 'SYSTEM_BASELINE', reviewed_by: null, reviewed_at: null, current_version_id: 'pv-3' },
    ]
  },
  async listAutonomyActions() {
    return [
      { id: 'a-1', project_id: projectId, action_key: 'approval-action', risk_level: 'HIGH', confidence: '0.8', status: 'PENDING_APPROVAL', approval_workflow_instance_id: 'wf-1', policy_version_id: 'pv-2', created_at: '2026-09-08T00:00:00Z', executed_at: null, rolled_back_at: null },
      { id: 'a-2', project_id: projectId, action_key: 'auto-action', risk_level: 'HIGH', confidence: '0.95', status: 'FAILED', approval_workflow_instance_id: null, policy_version_id: 'pv-1', created_at: '2026-09-08T01:00:00Z', executed_at: null, rolled_back_at: null },
    ]
  },
})

const result = await state.read(projectId)
assert.equal(result.controls.autonomyExpansionAllowed, false)
assert.equal(result.controls.directMutationEnabled, false)
assert.equal(result.controls.emergencyKillMutationEnabled, false)
assert.equal(result.controls.policyMutationEnabled, false)
assert.equal(result.counts.aiSystems, 1)
assert.equal(result.counts.enabledAutoPolicies, 1)
assert.equal(result.counts.enabledApprovalPolicies, 1)
assert.equal(result.counts.blockedPolicies, 1)
assert.equal(result.counts.openActions, 1)
assert.ok(result.counts.highOrCriticalFindings >= 4)

const codes = new Set(result.findings.map((finding) => finding.code))
for (const code of [
  'AI_SYSTEM_NOT_APPROVED',
  'AUTO_POLICY_ENABLED',
  'AUTO_POLICY_NOT_REVIEWED',
  'AUTO_POLICY_NOT_REVERSIBLE',
  'AUTO_POLICY_HIGH_RISK',
  'APPROVAL_POLICY_ENABLED',
  'BLOCKED_POLICY',
  'ACTION_PENDING_APPROVAL',
  'ACTION_FAILED',
]) assert.ok(codes.has(code), `missing ${code}`)

await assert.rejects(() => state.read('   '), /projectId is required/)
console.log('Command Center control-state behavior verified.')
