import assert from 'node:assert/strict'

const REQUIRED_SCOPES = [
  'DATABASE',
  'STORAGE',
  'IDENTITY_CONFIG',
  'APPLICATION_CONFIG',
  'EDGE_RUNTIME',
  'DEPENDENCIES',
  'SERVICE_VALIDATION',
]

function scopeCoverage(scopeResults, requiredScopes = REQUIRED_SCOPES) {
  const missing = []
  const failed = []
  for (const scope of requiredScopes) {
    if (!(scope in scopeResults)) missing.push(scope)
    else if (String(scopeResults[scope]?.status ?? '').toUpperCase() !== 'PASSED') failed.push(scope)
  }
  return { complete: missing.length === 0 && failed.length === 0, missing, failed }
}

function evaluateReadiness({ enabled = true, latestDrill = null, requiredScopes = REQUIRED_SCOPES, now = new Date('2026-09-11T10:00:00Z') }) {
  if (!enabled) return 'DISABLED'
  if (!latestDrill) return 'DRILL_REQUIRED'
  const coverage = scopeCoverage(latestDrill.scopeResults ?? {}, requiredScopes)
  if (!coverage.complete) return 'SCOPE_COVERAGE_INCOMPLETE'
  if (!latestDrill.externalEvidenceRef?.trim()) return 'EXTERNAL_EVIDENCE_REQUIRED'
  if (!latestDrill.incidentAt || !latestDrill.recoveryPointAt || !latestDrill.startedAt || !latestDrill.serviceReadyAt) return 'TIMING_EVIDENCE_REQUIRED'
  if (latestDrill.policyResult !== 'PASSED') return 'TARGETS_NOT_MET'
  if (latestDrill.nextDrillDueAt && new Date(latestDrill.nextDrillDueAt) < now) return 'DRILL_OVERDUE'
  return 'READY'
}

const allPassed = Object.fromEntries(REQUIRED_SCOPES.map((scope) => [scope, { status: 'PASSED' }]))

assert.deepEqual(scopeCoverage({ DATABASE: { status: 'PASSED' } }), {
  complete: false,
  missing: REQUIRED_SCOPES.slice(1),
  failed: [],
})
assert.deepEqual(scopeCoverage({ ...allPassed, STORAGE: { status: 'FAILED' } }), {
  complete: false,
  missing: [],
  failed: ['STORAGE'],
})
assert.equal(scopeCoverage(allPassed).complete, true)

assert.equal(evaluateReadiness({ latestDrill: { scopeResults: { DATABASE: { status: 'PASSED' } } } }), 'SCOPE_COVERAGE_INCOMPLETE')
assert.equal(evaluateReadiness({ latestDrill: { scopeResults: allPassed } }), 'EXTERNAL_EVIDENCE_REQUIRED')
assert.equal(evaluateReadiness({ latestDrill: { scopeResults: allPassed, externalEvidenceRef: 'artifact://run/1' } }), 'TIMING_EVIDENCE_REQUIRED')
assert.equal(evaluateReadiness({ latestDrill: {
  scopeResults: allPassed,
  externalEvidenceRef: 'artifact://run/1',
  incidentAt: '2026-09-11T08:00:00Z',
  recoveryPointAt: '2026-09-11T07:50:00Z',
  startedAt: '2026-09-11T08:00:00Z',
  serviceReadyAt: '2026-09-11T08:40:00Z',
  policyResult: 'FAILED',
} }), 'TARGETS_NOT_MET')
assert.equal(evaluateReadiness({ latestDrill: {
  scopeResults: allPassed,
  externalEvidenceRef: 'artifact://run/1',
  incidentAt: '2026-09-11T08:00:00Z',
  recoveryPointAt: '2026-09-11T07:50:00Z',
  startedAt: '2026-09-11T08:00:00Z',
  serviceReadyAt: '2026-09-11T08:40:00Z',
  policyResult: 'PASSED',
  nextDrillDueAt: '2026-09-10T00:00:00Z',
} }), 'DRILL_OVERDUE')
assert.equal(evaluateReadiness({ latestDrill: {
  scopeResults: allPassed,
  externalEvidenceRef: 'artifact://run/1',
  incidentAt: '2026-09-11T08:00:00Z',
  recoveryPointAt: '2026-09-11T07:50:00Z',
  startedAt: '2026-09-11T08:00:00Z',
  serviceReadyAt: '2026-09-11T08:40:00Z',
  policyResult: 'PASSED',
  nextDrillDueAt: '2026-12-10T00:00:00Z',
} }), 'READY')

console.log('Recovery Assurance v2 fail-closed behavior tests passed.')
