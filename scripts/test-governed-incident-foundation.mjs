import assert from 'node:assert/strict'
import { assertGovernedIncidentTruthInvariant, assertIncidentLifecycleTransition, canTransitionIncidentLifecycle, deriveIncidentLifecycleState } from '../lib/governance/governed-incident.ts'

assert.equal(deriveIncidentLifecycleState({ issueStatus: 'OPEN', hasRootCauseEvidence: false, verificationRequired: false }), 'DETECTED')
assert.equal(deriveIncidentLifecycleState({ issueStatus: 'TRIAGED', hasRootCauseEvidence: false, verificationRequired: false }), 'TRIAGED')
assert.equal(deriveIncidentLifecycleState({ issueStatus: 'IN_PROGRESS', hasRootCauseEvidence: false, verificationRequired: false }), 'INVESTIGATING')
assert.equal(deriveIncidentLifecycleState({ issueStatus: 'IN_PROGRESS', hasRootCauseEvidence: true, verificationRequired: false }), 'ROOT_CAUSE_IDENTIFIED')
assert.equal(deriveIncidentLifecycleState({ issueStatus: 'IN_PROGRESS', hasRootCauseEvidence: true, remediationStatus: 'PLANNED', verificationRequired: false }), 'REMEDIATION_PLANNED')
assert.equal(deriveIncidentLifecycleState({ issueStatus: 'IN_PROGRESS', hasRootCauseEvidence: true, remediationStatus: 'IN_PROGRESS', verificationRequired: true }), 'REMEDIATION_IN_PROGRESS')
assert.equal(deriveIncidentLifecycleState({ issueStatus: 'RESOLVED', hasRootCauseEvidence: true, remediationStatus: 'COMPLETED', verificationRequired: true }), 'VERIFICATION_PENDING')
assert.equal(deriveIncidentLifecycleState({ issueStatus: 'RESOLVED', hasRootCauseEvidence: true, verificationRequired: true, verificationStatus: 'QUEUED' }), 'VERIFYING')
assert.equal(deriveIncidentLifecycleState({ issueStatus: 'RESOLVED', hasRootCauseEvidence: true, verificationRequired: true, verificationStatus: 'VERIFIED' }), 'VERIFIED_RESOLVED')
assert.equal(deriveIncidentLifecycleState({ issueStatus: 'RESOLVED', hasRootCauseEvidence: true, verificationRequired: true, verificationStatus: 'VERIFICATION_FAILED' }), 'VERIFICATION_FAILED')
assert.equal(deriveIncidentLifecycleState({ issueStatus: 'RESOLVED', hasRootCauseEvidence: false, verificationRequired: false, hasResolutionEvidence: true }), 'RESOLUTION_RECORDED')
assert.equal(deriveIncidentLifecycleState({ issueStatus: 'BLOCKED', hasRootCauseEvidence: true, verificationRequired: true }), 'BLOCKED')
assert.equal(deriveIncidentLifecycleState({ issueStatus: 'OPEN', hasRootCauseEvidence: true, verificationRequired: true, wasReopened: true }), 'REOPENED')

assert.equal(canTransitionIncidentLifecycle('DETECTED', 'TRIAGED'), true)
assert.equal(canTransitionIncidentLifecycle('VERIFYING', 'VERIFIED_RESOLVED'), true)
assert.equal(canTransitionIncidentLifecycle('VERIFICATION_FAILED', 'REMEDIATION_IN_PROGRESS'), true)
assert.equal(canTransitionIncidentLifecycle('DETECTED', 'VERIFIED_RESOLVED'), false)
assert.throws(() => assertIncidentLifecycleTransition('DETECTED', 'VERIFIED_RESOLVED'), /Invalid governed incident lifecycle transition/)

const goldenIncident = {
  truth: {
    incidentId: 'issue-1', projectId: 'project-1', datasetId: 'dataset-1', datasetVersionId: 'version-1', issueId: 'issue-1',
    severity: 'HIGH', issueStatus: 'RESOLVED', ownerUserId: 'owner-1', lifecycleState: 'VERIFIED_RESOLVED', verificationStatus: 'VERIFIED',
    openedAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T01:00:00.000Z', resolvedAt: '2026-09-12T01:00:00.000Z',
  },
  title: 'Golden incident', description: 'Canonical governed incident', profileRunId: 'profile-before', findingIds: ['finding-1'], qualityRuleRunId: null, controlFindingId: null,
  rootCauseEvidence: [], impactEvidence: [], remediationEvidence: [],
  verification: { required: true, status: 'VERIFIED', sourceRunId: 'profile-before', verificationRunId: 'profile-after', evidence: [] },
  evidence: [], truthBoundary: 'GOVERNED_OUTCOME_ONLY', authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE', evidenceVersion: 1,
}
assert.doesNotThrow(() => assertGovernedIncidentTruthInvariant(goldenIncident))
assert.throws(() => assertGovernedIncidentTruthInvariant({ ...goldenIncident, verification: { ...goldenIncident.verification, status: 'FAILED' } }), /requires authoritative verification evidence/)
assert.throws(() => assertGovernedIncidentTruthInvariant({ ...goldenIncident, truthBoundary: 'OTHER' }), /truth boundary/)

console.log('Governed incident lifecycle unit tests passed.')
