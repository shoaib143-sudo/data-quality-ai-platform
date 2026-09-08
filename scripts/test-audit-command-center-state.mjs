import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import ts from 'typescript'
import { pathToFileURL } from 'node:url'

const sourcePath = path.resolve('lib/ai/audit-command-center-state.ts')
const source = await fs.readFile(sourcePath, 'utf8')
const transpiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText
const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'audit-command-center-state-'))
const modulePath = path.join(dir, 'audit-command-center-state.mjs')
await fs.writeFile(modulePath, transpiled)
const { GovernedAuditCommandCenterState } = await import(pathToFileURL(modulePath).href)

const projectId = 'project-1'
const state = new GovernedAuditCommandCenterState({
  async listAuditEvents() {
    return [
      { id: 'event-1', project_id: projectId, actor_user_id: 'user-1', actor_type: 'USER', event_type: 'TEST_EVENT', entity_type: 'AI_SYSTEM', entity_id: 'entity-1', correlation_id: 'correlation-1', created_at: '2026-09-08T00:00:00Z', previous_hash: 'previous', event_hash: 'hash', chain_version: 3, chain_sequence: '12' },
      { id: 'event-cross-project', project_id: 'project-2', actor_user_id: null, actor_type: 'SYSTEM', event_type: 'OTHER_EVENT', entity_type: null, entity_id: null, correlation_id: null, created_at: '2026-09-08T00:01:00Z', previous_hash: null, event_hash: 'hash-2', chain_version: 3, chain_sequence: '13' },
    ]
  },
  async listAuditReportSnapshots() {
    return [
      { id: 'snapshot-1', project_id: projectId, report_type: 'GOVERNANCE', generated_by: 'user-1', actor_ref: 'user-1', actor_type: 'USER', chain_sequence: '12', chain_tip_event_id: 'event-1', chain_tip_event_hash: 'hash', audit_event_count: '12', report_hash: 'report-hash', created_at: '2026-09-08T00:02:00Z' },
      { id: 'snapshot-cross-project', project_id: 'project-2', report_type: 'GOVERNANCE', generated_by: null, actor_ref: null, actor_type: 'SYSTEM', chain_sequence: '1', chain_tip_event_id: 'other', chain_tip_event_hash: 'other-hash', audit_event_count: '1', report_hash: 'other-report-hash', created_at: '2026-09-08T00:03:00Z' },
    ]
  },
  async verifyAuditChain() {
    return { valid: true, failures: 0, v2_failures: 0, legacy_failures: 0, strict_failures: 0, events_checked: 12, v2_events_checked: 10, legacy_events_checked: 1, strict_events_checked: 1, v2_forks_observed: 0, legacy_forks_observed: 0, chain_version: 3, verified_at: '2026-09-08T00:04:00Z' }
  },
})

const result = await state.read(projectId)
assert.equal(result.projectId, projectId)
assert.equal(result.auditEvents.length, 1)
assert.equal(result.auditEvents[0].id, 'event-1')
assert.equal(result.auditReportSnapshots.length, 1)
assert.equal(result.auditReportSnapshots[0].id, 'snapshot-1')
assert.equal(result.chainVerification.valid, true)
assert.equal(result.chainVerification.failures, 0)
assert.equal(result.counts.visibleAuditEvents, 1)
assert.equal(result.counts.visibleAuditSnapshots, 1)
assert.equal(result.counts.visibleEventsMissingSequence, 0)
assert.equal(result.counts.visibleEventsMissingPreviousHash, 0)
await assert.rejects(() => state.read('   '), /projectId is required/)

console.log('Audit Command Center project scoping and canonical verifier projection verified.')