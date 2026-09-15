import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const seriesSource = fs.readFileSync(path.join(root, 'lib/data-quality/governed-real-case-buckets.ts'), 'utf8')
const serviceSource = fs.readFileSync(path.join(root, 'lib/data-quality/governed-real-case-bucket-service.ts'), 'utf8')
const routeSource = fs.readFileSync(path.join(root, 'app/api/analytics/governed-real-case-buckets/route.ts'), 'utf8')

for (const required of [
  "REAL_CASE_BUCKET_SERIES_VERSION = 'real-case-bucket-series-v1'",
  "export type RealCaseBucketGranularity = 'DAY' | 'WEEK' | 'MONTH'",
  "status: 'INSUFFICIENT_EVIDENCE'",
  "status: 'OK'",
  "input.buckets.length > 24",
  "start <= priorEnd",
  "end > cutoff",
  "analysis.status === 'OK' && analysis.sampleSize >= minimumSampleSize",
  'outcomeCounts: null',
  'observedRates: null',
  "analysisType: 'REAL_CASE_OUTCOME_BUCKET_SERIES'",
  'predictive_probability_exposed: false',
  'causal_effect_claimed: false',
  'interpolation_permitted: false',
]) {
  assert.ok(seriesSource.includes(required), `Bucket series contract is missing: ${required}`)
}

assert.ok(!seriesSource.includes('predictionProbability'), 'Bucket series must not expose predictive probability.')
assert.ok(!seriesSource.includes('interpolatedRate'), 'Bucket series must not synthesize interpolated rates.')

for (const required of [
  'daysInUtcMonth',
  'Math.min(start.getUTCDate(), daysInUtcMonth(targetYear, targetMonth))',
  'nextStart - 1',
  "persist: false",
  'runGovernedRealCaseAnalysis({',
  ".from('analysis_evidence_envelopes')",
  "windowEnd > cutoff",
]) {
  assert.ok(serviceSource.includes(required), `Bucket service contract is missing: ${required}`)
}

for (const required of [
  'await requireUser()',
  "await authorizeProject(user.id, projectId, 'agent.view')",
  "value === 'DAY' || value === 'WEEK' || value === 'MONTH'",
  'minimumSampleSize < 1 || minimumSampleSize > 1000',
  'runGovernedRealCaseBucketSeries({',
  'persist: false',
  'historical_observation_only: true',
  'interpolation_permitted: false',
  'predictive_probability_exposed: false',
  'causal_effect_claimed: false',
  'current_authorization_required: true',
  'read_request_persists_learning_state: false',
]) {
  assert.ok(routeSource.includes(required), `Bucket API contract is missing: ${required}`)
}

assert.ok(!routeSource.includes('persist: true'), 'Read-only bucket API must never persist analysis state.')
assert.ok(!routeSource.includes('createAdminClient'), 'Read-only bucket API must not create an admin client directly.')

console.log('Governed real-case bucket series contract verification passed.')
