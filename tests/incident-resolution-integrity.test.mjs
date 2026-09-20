import assert from 'node:assert/strict'
import test from 'node:test'

import {
  deriveIssueResolutionMutation,
  effectiveResolutionSummary,
  isTerminalIssueStatus,
  requiresGovernedResolutionEvidence,
  shouldCompensateVerificationSchedulingFailure,
} from '../lib/governance/incident-resolution-integrity.ts'

test('terminal issue status handling is normalized and explicit', () => {
  assert.equal(isTerminalIssueStatus(' resolved '), true)
  assert.equal(isTerminalIssueStatus('CLOSED'), true)
  assert.equal(isTerminalIssueStatus('OPEN'), false)
  assert.equal(isTerminalIssueStatus(null), false)
})

test('resolution mutation preserves first resolution timestamp and clears it on reopen', () => {
  assert.deepEqual(deriveIssueResolutionMutation({
    previousStatus: 'OPEN',
    nextStatus: 'RESOLVED',
    previousResolvedAt: null,
    now: '2026-09-20T00:00:00.000Z',
  }), {
    wasResolved: false,
    willBeResolved: true,
    resolvingNow: true,
    reopeningNow: false,
    resolvedAt: '2026-09-20T00:00:00.000Z',
  })

  assert.equal(deriveIssueResolutionMutation({
    previousStatus: 'RESOLVED',
    nextStatus: 'CLOSED',
    previousResolvedAt: '2026-09-19T00:00:00.000Z',
    now: '2026-09-20T00:00:00.000Z',
  }).resolvedAt, '2026-09-19T00:00:00.000Z')

  assert.deepEqual(deriveIssueResolutionMutation({
    previousStatus: 'CLOSED',
    nextStatus: 'OPEN',
    previousResolvedAt: '2026-09-19T00:00:00.000Z',
    now: '2026-09-20T00:00:00.000Z',
  }), {
    wasResolved: true,
    willBeResolved: false,
    resolvingNow: false,
    reopeningNow: true,
    resolvedAt: null,
  })
})

test('governed remediation cannot terminate without effective resolution evidence', () => {
  assert.equal(effectiveResolutionSummary('existing evidence', undefined, false), 'existing evidence')
  assert.equal(effectiveResolutionSummary('existing evidence', ' replacement ', true), 'replacement')
  assert.equal(requiresGovernedResolutionEvidence({
    governedRemediation: true,
    nextStatus: 'RESOLVED',
    effectiveSummary: '',
  }), true)
  assert.equal(requiresGovernedResolutionEvidence({
    governedRemediation: true,
    nextStatus: 'OPEN',
    effectiveSummary: '',
  }), false)
  assert.equal(requiresGovernedResolutionEvidence({
    governedRemediation: false,
    nextStatus: 'RESOLVED',
    effectiveSummary: '',
  }), false)
})

test('verification scheduling failure is compensated only on a new governed terminal transition', () => {
  assert.equal(shouldCompensateVerificationSchedulingFailure({ governedRemediation: true, resolvingNow: true }), true)
  assert.equal(shouldCompensateVerificationSchedulingFailure({ governedRemediation: true, resolvingNow: false }), false)
  assert.equal(shouldCompensateVerificationSchedulingFailure({ governedRemediation: false, resolvingNow: true }), false)
})
