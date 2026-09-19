import assert from 'node:assert/strict'
import test from 'node:test'
import { assertNoUnregisteredMandatoryCapabilities, summarizeCapabilityCoverage } from '../lib/orchestration/capability-coverage.ts'

const descriptor = (capabilityKey, overrides = {}) => ({
  capabilityKey,
  domain: 'GOVERNANCE',
  version: '1.0',
  mandatoryForE2E: true,
  executorType: 'WORKFLOW',
  executorKey: capabilityKey,
  requiredCapability: null,
  riskTier: 'LOW',
  dependencies: [],
  evidenceContract: ['canonical_evidence'],
  certificationGate: 'certify',
  enabled: true,
  ...overrides,
})

test('accounts every enabled mandatory capability independently from execution success', () => {
  const summary = summarizeCapabilityCoverage(
    [descriptor('a'), descriptor('b'), descriptor('optional', { mandatoryForE2E: false })],
    [
      { capabilityKey: 'a', outcome: 'EXECUTED_AND_PASSED', evidenceRefs: ['e1'], reason: null },
      { capabilityKey: 'b', outcome: 'BLOCKED_POLICY', evidenceRefs: ['e2'], reason: 'approval required' },
    ],
  )
  assert.equal(summary.accountingCoveragePct, 100)
  assert.equal(summary.executionCoveragePct, 50)
  assert.equal(summary.blocked, 1)
  assert.equal(summary.certificationEligible, false)
})

test('fails closed when a mandatory capability is unaccounted', () => {
  const summary = summarizeCapabilityCoverage(
    [descriptor('a'), descriptor('b')],
    [{ capabilityKey: 'a', outcome: 'EXECUTED_AND_PASSED', evidenceRefs: ['e1'], reason: null }],
  )
  assert.equal(summary.unaccounted, 1)
  assert.equal(summary.certificationEligible, false)
})

test('fails closed when executed mandatory capability lacks required evidence', () => {
  const summary = summarizeCapabilityCoverage(
    [descriptor('a')],
    [{ capabilityKey: 'a', outcome: 'EXECUTED_AND_PASSED', evidenceRefs: [], reason: null }],
  )
  assert.equal(summary.missingEvidence, 1)
  assert.equal(summary.certificationEligible, false)
})

test('rejects duplicate descriptor and result keys instead of silently overwriting them', () => {
  assert.throws(
    () => summarizeCapabilityCoverage([descriptor('a'), descriptor('a')], []),
    /Duplicate descriptor capability key: a/,
  )
  assert.throws(
    () => summarizeCapabilityCoverage(
      [descriptor('a')],
      [
        { capabilityKey: 'a', outcome: 'EXECUTED_AND_PASSED', evidenceRefs: ['e1'], reason: null },
        { capabilityKey: 'a', outcome: 'EXECUTED_AND_FAILED', evidenceRefs: ['e2'], reason: 'duplicate' },
      ],
    ),
    /Duplicate result capability key: a/,
  )
})

test('detects discovered production capabilities missing from the enabled registry', () => {
  const missing = assertNoUnregisteredMandatoryCapabilities(
    ['governance.policy', 'ai.rag.grounded', 'profiling.metrics', 'ai.rag.grounded'],
    [descriptor('governance.policy'), descriptor('profiling.metrics', { enabled: false })],
  )
  assert.deepEqual(missing, ['ai.rag.grounded', 'profiling.metrics'])
})
