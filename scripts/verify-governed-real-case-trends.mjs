import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const trendSource = fs.readFileSync(path.join(root, 'lib/data-quality/governed-real-case-trends.ts'), 'utf8')
const serviceSource = fs.readFileSync(path.join(root, 'lib/data-quality/governed-real-case-trend-service.ts'), 'utf8')
const routeSource = fs.readFileSync(path.join(root, 'app/api/analytics/governed-real-case-trends/route.ts'), 'utf8')

for (const required of [
  "REAL_CASE_TREND_VERSION = 'real-case-trend-v1'",
  "status: 'INSUFFICIENT_EVIDENCE'",
  "status: 'OK'",
  "previousEnd >= currentStart",
  "throw new Error('Trend comparison windows must not overlap.')",
  "currentEnd > cutoff",
  "previousObservedRates",
  "currentObservedRates",
  "observedRateDelta",
  "predictive_probability_exposed: false",
  "causal_effect_claimed: false",
  "analysisType: 'REAL_CASE_OUTCOME_TREND_COMPARISON'",
]) {
  assert.ok(trendSource.includes(required), `Trend comparison contract is missing: ${required}`)
}

assert.ok(
  trendSource.includes("const previousReady = previousAnalysis.status === 'OK' && previousSampleSize >= minimumSampleSize"),
  'Previous-window observed rates must require an independently sufficient sample.',
)
assert.ok(
  trendSource.includes("const currentReady = currentAnalysis.status === 'OK' && currentSampleSize >= minimumSampleSize"),
  'Current-window observed rates must require an independently sufficient sample.',
)
assert.ok(
  trendSource.includes("if (!previousReady || !currentReady)"),
  'Observed trend rates must fail closed when either window is insufficient.',
)
assert.ok(
  trendSource.includes("if (previousAnalysis.status !== 'OK' || currentAnalysis.status !== 'OK')"),
  'Outcome counts must only be read after explicit discriminated-union narrowing.',
)
assert.ok(
  !trendSource.includes('predictionProbability'),
  'Trend comparison must not expose predictive probability.',
)

for (const required of [
  'runGovernedRealCaseAnalysis({',
  'previousWindowStart',
  'currentWindowStart',
  'persist: false',
  ".from('analysis_evidence_envelopes')",
]) {
  assert.ok(serviceSource.includes(required), `Trend service contract is missing: ${required}`)
}

for (const required of [
  'await requireUser()',
  "await authorizeProject(user.id, projectId, 'agent.view')",
  'runGovernedRealCaseTrendComparison({',
  'persist: false',
  'historical_observation_only: true',
  'current_authorization_required: true',
]) {
  assert.ok(routeSource.includes(required), `Trend API authorization/read-only contract is missing: ${required}`)
}

assert.ok(
  !routeSource.includes('persist: true'),
  'Read-only trend API must never persist analysis state.',
)

console.log('Governed real-case trend comparison contract verification passed.')
