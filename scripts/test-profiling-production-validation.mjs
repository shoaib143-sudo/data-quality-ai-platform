import assert from 'node:assert/strict'
import test from 'node:test'

import { evaluateProfilingProductionSnapshot } from './lib/profiling-production-validation.mjs'

function validRun(overrides = {}) {
  return {
    id: 'run-1',
    contract: {
      valid: true,
      metric_contract_valid: true,
      score_present: true,
      score_values_valid: true,
      score_consistent: true,
      completed_facts_present: true,
    },
    profileColumns: 3,
    metrics: 89,
    findings: 2,
    scorePresent: true,
    investigationPresent: true,
    governanceInsightPresent: true,
    ...overrides,
  }
}

function validSnapshot(overrides = {}) {
  return {
    profileRuns: 3,
    completedRuns: 2,
    activeSourceTypes: { FILE: 1, JDBC: 1 },
    latestRuns: [validRun()],
    ...overrides,
  }
}

test('accepts a complete production profiling snapshot', () => {
  assert.equal(evaluateProfilingProductionSnapshot(validSnapshot()).valid, true)
})

test('allows a deterministic no-findings outcome', () => {
  const result = evaluateProfilingProductionSnapshot(validSnapshot({
    latestRuns: [validRun({ findings: 0 })],
  }))
  assert.equal(result.valid, true)
  assert.deepEqual(result.warnings, ['RUN_run-1_NO_FINDINGS'])
})

test('fails closed when FILE coverage is absent', () => {
  const result = evaluateProfilingProductionSnapshot(validSnapshot({
    activeSourceTypes: { JDBC: 2 },
  }))
  assert.equal(result.valid, false)
  assert.ok(result.failures.includes('NO_ACTIVE_FILE_EXECUTION_SOURCE'))
})

test('fails closed when JDBC coverage is absent', () => {
  const result = evaluateProfilingProductionSnapshot(validSnapshot({
    activeSourceTypes: { FILE: 2 },
  }))
  assert.equal(result.valid, false)
  assert.ok(result.failures.includes('NO_ACTIVE_JDBC_EXECUTION_SOURCE'))
})

test('fails on a broken persisted metric contract', () => {
  const result = evaluateProfilingProductionSnapshot(validSnapshot({
    latestRuns: [validRun({
      contract: {
        valid: false,
        metric_contract_valid: false,
        score_present: true,
        score_values_valid: true,
        score_consistent: true,
        completed_facts_present: true,
      },
    })],
  }))
  assert.equal(result.valid, false)
  assert.ok(result.failures.some((failure) => failure.includes('METRIC_CONTRACT_INVALID')))
})

test('fails on missing score, investigation, or governance projection', () => {
  const result = evaluateProfilingProductionSnapshot(validSnapshot({
    latestRuns: [validRun({
      scorePresent: false,
      investigationPresent: false,
      governanceInsightPresent: false,
    })],
  }))
  assert.equal(result.valid, false)
  assert.ok(result.failures.includes('RUN_run-1_NO_QUALITY_SCORE'))
  assert.ok(result.failures.includes('RUN_run-1_NO_CANONICAL_INVESTIGATION'))
  assert.ok(result.failures.includes('RUN_run-1_NO_GOVERNANCE_INSIGHT'))
})
