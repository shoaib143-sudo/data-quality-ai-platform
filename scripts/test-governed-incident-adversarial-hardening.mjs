import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  assertGovernedIncidentTruthInvariant,
  deriveIncidentLifecycleState,
} from '../lib/governance/governed-incident.ts'
import {
  deriveIssueResolutionMutation,
  effectiveResolutionSummary,
  requiresGovernedResolutionEvidence,
  shouldCompensateVerificationSchedulingFailure,
} from '../lib/governance/incident-resolution-integrity.ts'

const reopenedState = deriveIncidentLifecycleState({
  issueStatus: 'IN_PROGRESS',
  hasRootCauseEvidence: true,
  verificationRequired: true,
  verificationStatus: 'VERIFIED',
})
assert.equal(reopenedState, 'REOPENED', 'Historical VERIFIED evidence must not override a reopened issue.')

const reopenedFailureState = deriveIncidentLifecycleState({
  issueStatus: 'IN_PROGRESS',
  hasRootCauseEvidence: true,
  verificationRequired: true,
  verificationStatus: 'VERIFICATION_FAILED',
})
assert.notEqual(reopenedFailureState, 'VERIFICATION_FAILED', 'A non-terminal issue must not present as a terminal verification failure state.')

const now = '2026-09-12T05:00:00.000Z'
const oldResolvedAt = '2026-09-12T04:00:00.000Z'
const reopenMutation = deriveIssueResolutionMutation({
  previousStatus: 'RESOLVED',
  nextStatus: 'IN_PROGRESS',
  previousResolvedAt: oldResolvedAt,
  now,
})
assert.equal(reopenMutation.reopeningNow, true)
assert.equal(reopenMutation.resolvedAt, null, 'Reopening must clear stale resolved_at.')

const firstResolution = deriveIssueResolutionMutation({
  previousStatus: 'IN_PROGRESS',
  nextStatus: 'RESOLVED',
  previousResolvedAt: null,
  now,
})
assert.equal(firstResolution.resolvingNow, true)
assert.equal(firstResolution.resolvedAt, now)

const terminalEdit = deriveIssueResolutionMutation({
  previousStatus: 'RESOLVED',
  nextStatus: 'CLOSED',
  previousResolvedAt: oldResolvedAt,
  now,
})
assert.equal(terminalEdit.resolvingNow, false)
assert.equal(terminalEdit.resolvedAt, oldResolvedAt, 'Terminal edits must preserve the original resolution timestamp.')

assert.equal(effectiveResolutionSummary('existing evidence', undefined, false), 'existing evidence')
assert.equal(effectiveResolutionSummary('existing evidence', '', true), '', 'Explicit clearing must be visible to the invariant check.')
assert.equal(requiresGovernedResolutionEvidence({ governedRemediation: true, nextStatus: 'RESOLVED', effectiveSummary: '' }), true)
assert.equal(requiresGovernedResolutionEvidence({ governedRemediation: true, nextStatus: 'IN_PROGRESS', effectiveSummary: '' }), false)
assert.equal(requiresGovernedResolutionEvidence({ governedRemediation: true, nextStatus: 'RESOLVED', effectiveSummary: 'verified fix' }), false)

assert.equal(shouldCompensateVerificationSchedulingFailure({ governedRemediation: true, resolvingNow: true }), true)
assert.equal(shouldCompensateVerificationSchedulingFailure({ governedRemediation: true, resolvingNow: false }), false)
assert.equal(shouldCompensateVerificationSchedulingFailure({ governedRemediation: false, resolvingNow: true }), false)

const baseIncident = {
  truth: {
    incidentId: 'issue-1', projectId: 'project-1', datasetId: 'dataset-1', datasetVersionId: 'version-1', issueId: 'issue-1',
    severity: 'HIGH', issueStatus: 'RESOLVED', ownerUserId: 'owner-1', lifecycleState: 'VERIFIED_RESOLVED', verificationStatus: 'VERIFIED',
    openedAt: '2026-09-12T00:00:00.000Z', updatedAt: oldResolvedAt, resolvedAt: oldResolvedAt,
  },
  title: 'Adversarial incident', description: null, profileRunId: 'profile-before', findingIds: [], qualityRuleRunId: null, controlFindingId: null,
  rootCauseEvidence: [], impactEvidence: [], remediationEvidence: [],
  verification: { required: true, status: 'VERIFIED', sourceRunId: 'profile-before', verificationRunId: 'profile-after', evidence: [] },
  evidence: [], truthBoundary: 'GOVERNED_OUTCOME_ONLY', authorizationBoundary: 'EXTERNAL_TO_PRESENTATION_ENGINE', evidenceVersion: 1,
}
assert.doesNotThrow(() => assertGovernedIncidentTruthInvariant(baseIncident))
assert.throws(() => assertGovernedIncidentTruthInvariant({
  ...baseIncident,
  truth: { ...baseIncident.truth, issueStatus: 'IN_PROGRESS' },
}), /requires the governance issue itself to remain RESOLVED or CLOSED/)
assert.throws(() => assertGovernedIncidentTruthInvariant({
  ...baseIncident,
  truth: { ...baseIncident.truth, issueStatus: 'IN_PROGRESS', lifecycleState: 'REOPENED' },
}), /must not retain resolvedAt/)

const routeSource = readFileSync(new URL('../app/api/issues/[issueId]/route.ts', import.meta.url), 'utf8')
assert.match(routeSource, /ISSUE_TITLE_REQUIRED/)
assert.match(routeSource, /requiresGovernedResolutionEvidence/)
assert.match(routeSource, /AMBIGUOUS_REMEDIATION_VERIFICATION_AUTHORITY/)
assert.match(routeSource, /resolutionMutation\.reopeningNow/)
assert.match(routeSource, /resolved_at: resolutionMutation\.resolvedAt/)
assert.match(routeSource, /ISSUE_RESOLUTION_VERIFICATION_SCHEDULING_FAILED/)
assert.match(routeSource, /REMEDIATION_VERIFICATION_SCHEDULING_FAILED/)
assert.match(routeSource, /\.eq\('updated_at', data\.updated_at\)/, 'Compensation must use optimistic concurrency rather than blind rollback.')
assert.match(routeSource, /resolution_evidence_preserved: true/)

const readerSource = readFileSync(new URL('../lib/governance/governed-incident-reader.ts', import.meta.url), 'utf8')
assert.match(readerSource, /assertIssueReferencesBelongToProject/)
assert.match(readerSource, /controlFindingId: issue\.control_finding_id/)
assert.match(readerSource, /Ambiguous governed incident remediation authority/)

const integritySource = readFileSync(new URL('../lib/governance/issue-reference-integrity.ts', import.meta.url), 'utf8')
assert.match(integritySource, /governance_findings/)
assert.match(integritySource, /ISSUE_CONTROL_FINDING_PROJECT_MISMATCH/)

const timestampMigration = readFileSync(new URL('../supabase/migrations/20260912043500_governance_issue_resolution_timestamp_integrity.sql', import.meta.url), 'utf8')
assert.match(timestampMigration, /set resolved_at = updated_at/i)
assert.match(timestampMigration, /set resolved_at = null/i)
assert.match(timestampMigration, /issues_resolution_timestamp_consistency/)
assert.match(timestampMigration, /validate constraint issues_resolution_timestamp_consistency/i)

console.log('Governed incident adversarial hardening tests passed.')
