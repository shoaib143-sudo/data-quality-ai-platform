import fs from 'node:fs'

const planner = fs.readFileSync('lib/orchestration/incremental-eligibility.ts', 'utf8')
const dispatch = fs.readFileSync('lib/orchestration/adaptive-dispatch.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Incremental eligibility contract missing: ${label}`)
}

requireText(planner, "executionMode: 'INCREMENTAL' | 'FULL_OR_SAMPLED_REQUIRED'", 'explicit planner mode contract')
requireText(planner, "authority !== 'SOURCE_OBSERVED'", 'source-observed authority required')
requireText(planner, "kind !== 'WATERMARK'", 'only watermark boundary supported initially')
requireText(planner, 'boundary.ordering_proven === true', 'ordering proof required')
requireText(planner, "reason: 'CHANGE_BOUNDARY_UNAVAILABLE'", 'missing boundary explicit reason')
requireText(planner, "reason: 'CHANGE_BOUNDARY_AUTHORITY_UNAVAILABLE'", 'missing authority explicit reason')
requireText(planner, "reason: 'CHANGE_BOUNDARY_INCOMPLETE'", 'incomplete boundary explicit reason')
requireText(planner, "reason: 'CHANGE_BOUNDARY_NOT_MONOTONIC'", 'non-monotonic boundary explicit reason')
requireText(planner, "reason: 'SOURCE_OBSERVED_MONOTONIC_WATERMARK'", 'eligible watermark reason')
requireText(planner, "metric_key: 'planner.incremental_eligibility'", 'planner telemetry')
requireText(dispatch, 'resolveIncrementalEligibility(jobs)', 'adaptive planner enrichment')
requireText(dispatch, 'recordIncrementalEligibilityTelemetry(jobs, incrementalEligibility)', 'adaptive planner telemetry integration')

if (dispatch.includes("executionMode === 'INCREMENTAL'") || dispatch.includes("execution_mode === 'INCREMENTAL'")) {
  throw new Error('Eligibility telemetry must not switch execution mode until connector incremental reads are implemented.')
}
if (planner.includes('dataset_versions.content_hash') || planner.includes('profile_signature')) {
  throw new Error('Incremental eligibility must not infer change boundaries from profiling/content fingerprints.')
}
if (planner.includes("authority: 'SOURCE_OBSERVED'\n      cursorColumn: null") && planner.includes('eligible: true')) {
  throw new Error('Incremental eligibility must not be granted without a concrete cursor boundary.')
}

console.log('Truth-aware incremental eligibility contracts verified.')
