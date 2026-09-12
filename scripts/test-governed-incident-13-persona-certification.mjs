import assert from 'node:assert/strict'
import { personaSlugs } from '../lib/governance/personas.ts'
import { buildGovernedIncidentView } from '../lib/governance/governed-incident-view.ts'
import { assertGovernedIncidentTruthInvariant } from '../lib/governance/governed-incident.ts'

const incident = {
  truth: {
    incidentId: 'incident-golden-001',
    projectId: 'project-golden-001',
    datasetId: 'dataset-golden-001',
    datasetVersionId: 'dataset-version-golden-001',
    issueId: 'incident-golden-001',
    severity: 'HIGH',
    issueStatus: 'RESOLVED',
    ownerUserId: 'user-owner-001',
    lifecycleState: 'VERIFIED_RESOLVED',
    verificationStatus: 'VERIFIED',
    openedAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-02T00:00:00.000Z',
    resolvedAt: '2026-09-02T00:00:00.000Z',
  },
  title: 'Golden governed data-quality incident',
  description: 'Known incident used to certify persona presentation truth invariants.',
  profileRunId: 'profile-source-001',
  findingIds: ['finding-001'],
  qualityRuleRunId: 'quality-rule-run-001',
  controlFindingId: null,
  rootCauseEvidence: [{
    authority: 'DATA_QUALITY',
    sourceTable: 'governance.data_quality_investigations',
    sourceId: 'investigation-001',
    kind: 'PROBABLE_ROOT_CAUSE',
    observedAt: '2026-09-01T01:00:00.000Z',
    deterministic: false,
    explanation: 'SOURCE_VALIDATION_OR_MAPPING_GAP',
    confidence: 0.8,
    advisory: true,
  }],
  impactEvidence: [{
    authority: 'BUSINESS_CONTEXT',
    sourceTable: 'governance.dataset_business_context_links',
    sourceId: 'context-link-001',
    kind: 'BUSINESS_CONTEXT_LINK',
    observedAt: '2026-09-01T02:00:00.000Z',
    deterministic: true,
    assetType: 'BUSINESS_CONTEXT',
    assetId: 'asset-001',
    assetName: 'Customer operations',
    relationship: 'SUPPORTS',
    distance: 1,
    riskScore: null,
    confidence: 1,
  }],
  remediationEvidence: [{
    authority: 'REMEDIATION',
    sourceTable: 'governance.data_quality_remediation_outcomes',
    sourceId: 'remediation-outcome-001',
    kind: 'DATA_QUALITY_REMEDIATION',
    observedAt: '2026-09-02T00:00:00.000Z',
    deterministic: true,
    status: 'VERIFIED',
    action: 'correct_invalid_domain_or_format_values',
    workflowInstanceId: 'workflow-001',
  }],
  verification: {
    required: true,
    status: 'VERIFIED',
    sourceRunId: 'profile-source-001',
    verificationRunId: 'profile-verification-001',
    qualityScoreDelta: 7.5,
    highSeverityFindingsDelta: -1,
    verifiedAt: '2026-09-02T00:00:00.000Z',
    evidence: [{
      authority: 'PROFILING',
      sourceTable: 'profiling.profile_runs',
      sourceId: 'profile-verification-001',
      kind: 'VERIFICATION_PROFILE_RUN',
      observedAt: '2026-09-02T00:00:00.000Z',
      deterministic: true,
    }],
  },
  evidence: [
    { authority: 'ISSUE', sourceTable: 'governance.issues', sourceId: 'incident-golden-001', kind: 'GOVERNANCE_ISSUE', observedAt: '2026-09-02T00:00:00.000Z', deterministic: true },
    { authority: 'PROFILING', sourceTable: 'profiling.profile_runs', sourceId: 'profile-verification-001', kind: 'VERIFICATION_PROFILE_RUN', observedAt: '2026-09-02T00:00:00.000Z', deterministic: true },
  ],
  truthBoundary: 'GOVERNED_OUTCOME_ONLY',
  authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE',
  evidenceVersion: 1,
}

assert.equal(personaSlugs.length, 13, 'Certification baseline must include exactly the 13 formal governance personas.')
assertGovernedIncidentTruthInvariant(incident)

const immutableSnapshot = JSON.stringify(incident)
const views = personaSlugs.map((persona) => buildGovernedIncidentView(incident, persona))
const fingerprint = views[0].truthFingerprint
const evidenceFingerprint = JSON.stringify(incident.evidence)
const verificationFingerprint = JSON.stringify(incident.verification)

for (const view of views) {
  assert.equal(view.truthFingerprint, fingerprint, `${view.plan.persona} changed governed truth.`)
  assert.equal(JSON.stringify(view.incident.evidence), evidenceFingerprint, `${view.plan.persona} changed governed evidence.`)
  assert.equal(JSON.stringify(view.incident.verification), verificationFingerprint, `${view.plan.persona} changed verification truth.`)
  assert.equal(view.incident.truthBoundary, 'GOVERNED_OUTCOME_ONLY')
  assert.equal(view.incident.authorizationBoundary, 'EXTERNAL_TO_PRESENTATION_ENGINE')
  assert.equal(view.plan.persona, view.plan.persona)
  assert.ok(view.components.length > 0, `${view.plan.persona} must have governed components.`)
  assert.equal(new Set(view.components.map((component) => component.id)).size, view.components.length, `${view.plan.persona} must not render duplicate governed components.`)
}

assert.equal(JSON.stringify(incident), immutableSnapshot, 'Presentation building must not mutate the canonical incident.')
assert.equal(new Set(views.map((view) => view.plan.persona)).size, 13, 'Each formal persona must have exactly one certified view.')
assert.ok(new Set(views.map((view) => view.plan.primaryQuestion)).size > 1, 'Persona presentation must vary primary questions while truth remains fixed.')
assert.ok(new Set(views.map((view) => view.plan.abstraction)).size > 1, 'Persona presentation must vary abstraction while truth remains fixed.')
assert.ok(new Set(views.map((view) => view.components.map((component) => component.id).join('|'))).size > 1, 'Persona presentation must vary component ordering/selection while truth remains fixed.')
assert.ok(new Set(views.map((view) => view.plan.actionEmphasis.join('|'))).size > 1, 'Persona presentation must vary action emphasis while truth remains fixed.')

for (const invariant of ['severity', 'issueStatus', 'ownerUserId', 'lifecycleState', 'verificationStatus', 'datasetId', 'datasetVersionId']) {
  const values = new Set(views.map((view) => JSON.stringify(view.incident.truth[invariant])))
  assert.equal(values.size, 1, `${invariant} must remain identical across all 13 personas.`)
}

console.log(`Governed incident 13-persona certification passed: ${views.length}/13 personas preserve one truth fingerprint (${fingerprint}).`)
