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
    sourceType: 'FILE',
    ...overrides,
  }
}

function validSnapshot(overrides = {}) {
  return {
    profileRuns: 3,
    completedRuns: 2,
    activeSourceTypes: { FILE: 1, JDBC: 1 },
    ambiguousActiveSourceDatasetVersions: [],
    activeDatasetVersionsWithoutCompletedProfile: [],
    latestRuns: [validRun(), validRun({ id: 'run-2', sourceType: 'JDBC' })],
    latestAttempts: [
      { id: 'run-1', datasetVersionId: 'dataset-file', status: 'COMPLETED', activeSource: true },
      { id: 'run-2', datasetVersionId: 'dataset-jdbc', status: 'COMPLETED', activeSource: true },
    ],
    ...overrides,
  }
}

test('accepts a complete production profiling snapshot', () => {
  assert.equal(evaluateProfilingProductionSnapshot(validSnapshot()).valid, true)
})

test('allows a deterministic no-findings outcome', () => {
  const result = evaluateProfilingProductionSnapshot(validSnapshot({
    latestRuns: [validRun({ findings: 0 }), validRun({ id: 'run-2', sourceType: 'JDBC' })],
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
    }), validRun({ id: 'run-2', sourceType: 'JDBC' })],
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
    }), validRun({ id: 'run-2', sourceType: 'JDBC' })],
  }))
  assert.equal(result.valid, false)
  assert.ok(result.failures.includes('RUN_run-1_NO_QUALITY_SCORE'))
  assert.ok(result.failures.includes('RUN_run-1_NO_CANONICAL_INVESTIGATION'))
  assert.ok(result.failures.includes('RUN_run-1_NO_GOVERNANCE_INSIGHT'))
})


test('fails when active source types exist but no completed JDBC profile is certified', () => {
  const result = evaluateProfilingProductionSnapshot(validSnapshot({
    latestRuns: [validRun({ sourceType: 'FILE' })],
  }))
  assert.equal(result.valid, false)
  assert.ok(result.failures.includes('NO_COMPLETED_JDBC_PROFILE'))
})

test('fails when active source types exist but no completed FILE profile is certified', () => {
  const result = evaluateProfilingProductionSnapshot(validSnapshot({
    latestRuns: [validRun({ sourceType: 'JDBC' })],
  }))
  assert.equal(result.valid, false)
  assert.ok(result.failures.includes('NO_COMPLETED_FILE_PROFILE'))
})


test('surfaces a newer failed attempt on an active dataset without invalidating older certified output', () => {
  const result = evaluateProfilingProductionSnapshot(validSnapshot({
    latestAttempts: [
      { id: 'run-3', datasetVersionId: 'dataset-file', status: 'FAILED', errorCode: 'ORPHANED_RUN_RECOVERED', activeSource: true },
      { id: 'run-2', datasetVersionId: 'dataset-jdbc', status: 'COMPLETED', activeSource: true },
    ],
  }))
  assert.equal(result.valid, true)
  assert.ok(result.warnings.includes('LATEST_ATTEMPT_dataset-file_FAILED_ORPHANED_RUN_RECOVERED'))
  assert.equal(result.summary.activeDatasetsWithNonCompletedLatestAttempt, 1)
})

test('does not warn on historical failed attempts for inactive dataset versions', () => {
  const result = evaluateProfilingProductionSnapshot(validSnapshot({
    latestAttempts: [
      { id: 'run-old', datasetVersionId: 'inactive-dataset', status: 'FAILED', activeSource: false },
    ],
  }))
  assert.equal(result.valid, true)
  assert.equal(result.warnings.some((warning) => warning.includes('inactive-dataset')), false)
})


test('fails closed when a dataset version has multiple active execution sources', () => {
  const result = evaluateProfilingProductionSnapshot(validSnapshot({
    ambiguousActiveSourceDatasetVersions: ['dataset-ambiguous'],
  }))
  assert.equal(result.valid, false)
  assert.ok(result.failures.includes('AMBIGUOUS_ACTIVE_EXECUTION_SOURCE_dataset-ambiguous'))
  assert.equal(result.summary.ambiguousActiveSourceDatasetVersions, 1)
})


test('fails closed when an active execution source has never completed profiling', () => {
  const result = evaluateProfilingProductionSnapshot(validSnapshot({
    activeDatasetVersionsWithoutCompletedProfile: ['dataset-never-profiled'],
  }))
  assert.equal(result.valid, false)
  assert.ok(result.failures.includes('ACTIVE_SOURCE_WITHOUT_COMPLETED_PROFILE_dataset-never-profiled'))
  assert.equal(result.summary.activeDatasetVersionsWithoutCompletedProfile, 1)
})
