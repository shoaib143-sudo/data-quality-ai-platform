import assert from 'node:assert/strict'
import { personaSlugs } from '../lib/governance/personas.ts'
import {
  approvalRequirement,
  approvalSlaDays,
  evaluateRisk,
} from '../lib/governance/agent-policy-v2.ts'
import { resolveConversationDefaults } from '../lib/governance/persona-conversation-defaults.ts'
import { createExecutionFingerprint } from '../lib/governance/execution-fingerprint.ts'
import { canAccessWorkspace } from '../lib/governance/workspace-policy.ts'

assert.equal(personaSlugs.length, 13)
for (const slug of personaSlugs) {
  assert.equal(canAccessWorkspace(slug, 'agents'), true, `${slug} must access Agents`)
  assert.equal(canAccessWorkspace(slug, 'monitoring'), true, `${slug} must access Job Monitor`)
}

assert.deepEqual(approvalSlaDays, { LOW: 7, MEDIUM: 5, HIGH: 3, CRITICAL: 1 })

const base = {
  environment: 'NON_PRODUCTION',
  materialProductionMutation: false,
  businessCriticality: 'STANDARD',
  dataSensitivity: 'LOW',
  financialImpact: 'LOW',
  productionScope: 'LOW',
  reversibility: 'REVERSIBLE',
  computeCost: 'LOW',
}
assert.equal(evaluateRisk(base), 'LOW')
assert.equal(evaluateRisk({ ...base, businessCriticality: 'KDE' }), 'HIGH')
assert.equal(evaluateRisk({ ...base, businessCriticality: 'CDE' }), 'HIGH')
assert.equal(evaluateRisk({ ...base, environment: 'PRODUCTION', materialProductionMutation: true, businessCriticality: 'CDE' }), 'CRITICAL')

const productionMaterial = approvalRequirement({
  ...base,
  environment: 'PRODUCTION',
  materialProductionMutation: true,
})
assert.equal(productionMaterial.requiresBusinessApproval, true)
assert.equal(productionMaterial.requiresGovernanceApproval, true)
assert.equal(productionMaterial.breakGlassAllowed, false)
assert.equal(productionMaterial.commentRequired, true)
assert.equal(productionMaterial.approvalValidUntilExecution, true)

const nonProductionCde = approvalRequirement({ ...base, businessCriticality: 'CDE' })
assert.equal(nonProductionCde.requiresBusinessApproval, false)
assert.equal(nonProductionCde.requiresGovernanceApproval, false)

const fpBase = {
  actionKey: 'PROFILE_DATASET',
  environment: 'PRODUCTION',
  projectId: '11111111-1111-1111-1111-111111111111',
  resourceIds: ['bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'],
  parameters: { depth: 1, mode: 'safe' },
  policyVersion: 'v2',
  businessCriticality: 'CDE',
}
const fp1 = createExecutionFingerprint(fpBase)
const fp2 = createExecutionFingerprint({ ...fpBase, resourceIds: [...fpBase.resourceIds].reverse() })
const fp3 = createExecutionFingerprint({ ...fpBase, parameters: { depth: 2, mode: 'safe' } })
assert.equal(fp1, fp2, 'resource ordering must not change fingerprint')
assert.notEqual(fp1, fp3, 'material parameter changes must change fingerprint')

const defaults = resolveConversationDefaults(
  'data-steward',
  { responseDepth: 'BALANCED' },
  { evidenceDepth: 'EVIDENCE_FIRST' },
  { responseDepth: 'CONCISE' },
)
assert.equal(defaults.responseDepth, 'CONCISE')
assert.equal(defaults.evidenceDepth, 'EVIDENCE_FIRST')
assert.ok(defaults.suggestedPrompts.length > 0)

console.log('PASS Agent Policy v2 unit tests')
