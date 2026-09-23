import assert from 'node:assert/strict'
import test from 'node:test'
import { assessGuidedReadiness } from '../lib/orchestration/governance-guided-readiness.ts'
import { nextGuidedInstruction } from '../lib/orchestration/governance-guided-journey.ts'

const source = { sourceId: 'source-A', sourceName: 'PUB Gold', versionNumber: 4, mode: 'SELECTED' }
const qualifiedNames = ['pub.gold.customer_water_consumption_behavior',
  'pub.gold.customer_water_consumption_behavior_drift_metrics',
  'pub.gold.customer_water_consumption_behavior_profile_metrics',
  'pub.gold.test', 'pub.gold.water_quality_compliance']

const scopes = [{ ...source, qualifiedNames }]
const discoveredAssets = qualifiedNames.map(assetKey => ({ sourceId: source.sourceId, assetKey, isCurrent: true }))
const twoDatasets = [
  { id: 'dataset-drift', dataSourceId: source.sourceId, sourceIdentifier: qualifiedNames[1], status: 'ACTIVE' },
  { id: 'dataset-profile', dataSourceId: source.sourceId, sourceIdentifier: qualifiedNames[2], status: 'ACTIVE' },
]
const versions = [
  { id: 'version-drift', datasetId: 'dataset-drift', versionNumber: 3, status: 'AVAILABLE' },
  { id: 'version-profile', datasetId: 'dataset-profile', versionNumber: 3, status: 'AVAILABLE' },
]
const bindings = versions.map(row => ({ datasetVersionId: row.id, active: true }))
const base = { scopes, discoveredAssets, datasets: twoDatasets, versions, executionSources: bindings }

test('real PUB Gold selection retains five selected tables and exposes three unregistered ones', () => {
  const readiness = assessGuidedReadiness(base)
  assert.equal(readiness.expectedCount, 5)
  assert.equal(readiness.readyCount, 2)
  assert.equal(readiness.ready, false)
  assert.equal(readiness.tables.filter(row => row.status === 'NOT_REGISTERED').length, 3)
  assert.equal(readiness.scopes[0].versionNumber, 4)
})
test('all five independently registered tables are required for an enumerated-table E2E preflight', () => {
  const extraDatasets = qualifiedNames.filter(name => !base.datasets.some(row => row.sourceIdentifier === name))
    .map((name, i) => ({ id: 'additional-' + i, dataSourceId: source.sourceId, sourceIdentifier: name, status: 'ACTIVE' }))
  const extraVersions = extraDatasets.map((row, i) => ({ id: 'additional-version-' + i, datasetId: row.id, versionNumber: 1, status: 'AVAILABLE' }))
  const readiness = assessGuidedReadiness({ ...base, datasets: [...base.datasets, ...extraDatasets],
    versions: [...base.versions, ...extraVersions],
    executionSources: [...base.executionSources, ...extraVersions.map(row => ({ datasetVersionId: row.id, active: true }))] })
  assert.equal(readiness.ready, true)
  assert.equal(readiness.readyCount, 5)
})
test('current-scope profiling authority blocks stale discovery even if registered and bound', () => {
  const checks = versions.map(row => ({ datasetVersionId: row.id, ready: false,
    blockerCodes: ['DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE'] }))
  const blocked = assessGuidedReadiness({ ...base, profileReadiness: checks })
  assert.equal(blocked.ready, false)
  assert.equal(blocked.readyCount, 0)
  assert.equal(blocked.tables.find(row => row.qualifiedName === qualifiedNames[1])?.status, 'PROFILE_READINESS_BLOCKED')
  assert.deepEqual(blocked.tables.find(row => row.qualifiedName === qualifiedNames[2])?.blockerCodes,
    ['DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE'])
  const passed = assessGuidedReadiness({ ...base,
    profileReadiness: checks.map(row => ({ ...row, ready: true, blockerCodes: [] })) })
  assert.equal(passed.readyCount, 2)
})

test('missing or non-current discovery evidence never counts as ready', () => {
  const readiness = assessGuidedReadiness({ ...base, discoveredAssets: base.discoveredAssets.map(row =>
    row.assetKey === qualifiedNames[1] ? { ...row, isCurrent: false } : row) })
  assert.equal(readiness.readyCount, 1)
  assert.equal(readiness.tables.find(row => row.qualifiedName === qualifiedNames[1])?.status, 'NOT_DISCOVERED')
})
test('stale latest version, inactive binding, or wrong project source is a blocker', () => {
  const processing = assessGuidedReadiness({ ...base, versions: [...versions,
    { id: 'version-drift-next', datasetId: 'dataset-drift', versionNumber: 4, status: 'PROCESSING' }] })
  assert.equal(processing.tables.find(row => row.qualifiedName === qualifiedNames[1])?.status, 'VERSION_NOT_AVAILABLE')
  const inactive = assessGuidedReadiness({ ...base, executionSources: bindings.map(row => ({ ...row, active: false })) })
  assert.equal(inactive.readyCount, 0)
  assert.equal(inactive.tables.find(row => row.qualifiedName === qualifiedNames[1])?.status, 'EXECUTION_SOURCE_MISSING')
  const wrongSource = assessGuidedReadiness({ ...base, datasets: twoDatasets.map(row => ({ ...row, dataSourceId: 'other-project-source' })) })
  assert.equal(wrongSource.readyCount, 0)
})
test('unknown, duplicate or unbounded source selections are never asserted ready', () => {
  assert.equal(assessGuidedReadiness({ ...base, scopes: [] }).ready, false)
  assert.equal(assessGuidedReadiness({ ...base, scopes: [{ ...source, mode: 'ALL', qualifiedNames }] }).ready, false)
  const duplicate = assessGuidedReadiness({ ...base, scopes: [{ ...source, qualifiedNames: [qualifiedNames[1], qualifiedNames[1]] }] })
  assert.equal(duplicate.expectedCount, 1)
  assert.equal(duplicate.readyCount, 1)
})

const journeyBase = {
  projectId: 'project-1', readinessLoaded: true, readinessReady: true,
  persistedMode: 'GUIDED', persistedEnabled: true, persistedEmergencyStop: false,
  hasUnsavedPolicyEdits: false, canExecute: true, goal: 'Run E2E governance for the five selected PUB Gold tables.',
  runId: null, runMode: null, runStatus: null,
  executedCount: 0, verifiedCount: 0, certificationEligible: false, assessmentState: null,
}
test('actual user sees project, scope and saved-policy steps before submission', () => {
  assert.equal(nextGuidedInstruction({ ...journeyBase, projectId: '' }).step, 'SELECT_PROJECT')
  assert.equal(nextGuidedInstruction({ ...journeyBase, readinessLoaded: false }).step, 'VERIFY_SOURCES')
  assert.equal(nextGuidedInstruction({ ...journeyBase, readinessReady: false }).step, 'VERIFY_SOURCES')
  assert.equal(nextGuidedInstruction({ ...journeyBase, persistedMode: 'OFF' }).step, 'SAVE_GUIDED_POLICY')
  assert.equal(nextGuidedInstruction({ ...journeyBase, persistedEmergencyStop: true }).step, 'SAVE_GUIDED_POLICY')
  assert.equal(nextGuidedInstruction({ ...journeyBase, hasUnsavedPolicyEdits: true }).step, 'SAVE_GUIDED_POLICY')
  assert.equal(nextGuidedInstruction({ ...journeyBase, canExecute: false }).step, 'OBTAIN_EXECUTION_ACCESS')
  assert.equal(nextGuidedInstruction({ ...journeyBase, goal: ' ' }).step, 'ENTER_GOAL')
  assert.equal(nextGuidedInstruction(journeyBase).step, 'SUBMIT_RUN')
})
test('a request to execute is not misrepresented as approval, verified evidence or certification', () => {
  const run = { ...journeyBase, runId: 'real-run', runMode: 'GUIDED' }
  assert.equal(nextGuidedInstruction({ ...run, runStatus: 'WAITING_APPROVAL' }).step, 'REVIEW_APPROVAL')
  assert.equal(nextGuidedInstruction({ ...run, runStatus: 'RUNNING' }).step, 'MONITOR_RUN')
  assert.equal(nextGuidedInstruction({ ...run, runStatus: 'FAILED' }).step, 'REVIEW_FAILURE')
  assert.equal(nextGuidedInstruction({ ...run, runStatus: 'BLOCKED_EXTERNAL' }).step, 'REVIEW_FAILURE')
  assert.equal(nextGuidedInstruction({ ...run, runStatus: 'SUCCEEDED' }).step, 'VERIFY_EVIDENCE')
  assert.equal(nextGuidedInstruction({ ...run, runStatus: 'SUCCEEDED', executedCount: 75, verifiedCount: 74,
    certificationEligible: false, assessmentState: 'PASS' }).step, 'VERIFY_EVIDENCE')
  assert.equal(nextGuidedInstruction({ ...run, runStatus: 'SUCCEEDED', executedCount: 75, verifiedCount: 75,
    certificationEligible: true }).step, 'REQUEST_CERTIFICATION')
  assert.equal(nextGuidedInstruction({ ...run, runStatus: 'SUCCEEDED', executedCount: 75, verifiedCount: 75,
    certificationEligible: true, assessmentState: 'PASS' }).step, 'COMPLETE')
})
test('an old FULL_AUTONOMOUS run is not a GUIDED test', () => {
  assert.equal(nextGuidedInstruction({ ...journeyBase, runId: 'old-run', runMode: 'FULL_AUTONOMOUS', runStatus: 'FAILED' }).step, 'SUBMIT_RUN')
})
