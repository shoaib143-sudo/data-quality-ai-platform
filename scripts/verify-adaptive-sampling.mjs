import fs from 'node:fs'

const sampling = fs.readFileSync('lib/profiling/sampling.ts', 'utf8')
const metricEngine = fs.readFileSync('lib/profiling/metric-engine.ts', 'utf8')

function requireText(text, needle, label) {
  if (!text.includes(needle)) throw new Error(`Adaptive sampling contract missing: ${label}`)
}

requireText(sampling, "export type SamplingPolicyOrigin = 'EXPLICIT_DATASET_POLICY' | 'AUTOMATIC_PLANNER'", 'explicit versus automatic authority')
requireText(sampling, "plannerReason = 'EXPLICIT_POLICY_PRESERVED'", 'explicit policy preservation')
requireText(sampling, "sourceObservedEstimate(metadata, 'source_row_count', 'source_row_count_authority')", 'source row estimate authority gate')
requireText(sampling, "sourceObservedEstimate(metadata, 'source_size_bytes', 'source_size_bytes_authority')", 'source size estimate authority gate')
requireText(sampling, "authority !== 'SOURCE_OBSERVED'", 'non-source evidence rejection')
requireText(sampling, 'completeFullScanEvidence = sourceRowsSafelyFull && sourceBytesSafelyFull', 'full scan requires both source-observed row and byte safety evidence')
requireText(sampling, "plannerReason = 'SOURCE_OBSERVED_SMALL_WORKLOAD_FULL_SCAN'", 'evidence-backed automatic full scan')
requireText(sampling, "plannerReason = 'SOURCE_OBSERVED_LARGE_WORKLOAD_SAFE_SAMPLE'", 'large source safe sampling')
requireText(sampling, "'UNKNOWN_SOURCE_CARDINALITY_SAFE_SAMPLE'", 'unknown source safe sampling')
requireText(sampling, "'INCOMPLETE_SOURCE_SIZE_EVIDENCE_SAFE_SAMPLE'", 'incomplete source evidence safe sampling')
requireText(sampling, "metric_key: 'planner.sampling_mode'", 'sampling planner telemetry')
requireText(sampling, "coverage_scope: coverageScope", 'coverage scope evidence')
requireText(sampling, "full_source_coverage_claimed: fullSourceCoverageClaimed", 'explicit full coverage claim flag')
requireText(sampling, "policy.sourceEstimateAuthority === 'SOURCE_OBSERVED'", 'full coverage source authority requirement')
requireText(sampling, 'policy.sourceRowEstimate != null', 'full coverage source row estimate requirement')
requireText(sampling, 'policy.sourceSizeEstimate != null', 'full coverage source size estimate requirement')
requireText(sampling, "Profiling evidence is bounded or sampled and must not be interpreted as proof of complete source coverage.", 'sample evidence warning')
requireText(metricEngine, 'resolveSamplingPolicy(supabase, datasetVersionId, requestedMaxRows)', 'metric engine planner integration')
requireText(metricEngine, 'sampling_policy: sampled.policy', 'sampling evidence persistence')
requireText(metricEngine, 'samplingPolicy.full_source_coverage_claimed === true', 'duplicate metrics full coverage authority')
requireText(metricEngine, "? 'FULL_DATASET' : 'SAMPLE'", 'duplicate metric sampled evidence basis')

if (sampling.includes("export type SamplingMode = 'FULL' | 'FIXED' | 'PERCENT' | 'AUTO'")) {
  throw new Error('Automatic planning must not become a persisted sampling policy mode.')
}
if (sampling.includes('sourceRowEstimate = finiteNumber(version?.row_count)') || sampling.includes('sourceRowEstimate = version.row_count')) {
  throw new Error('Profile/catalog row_count must not be promoted to source-authoritative cardinality.')
}
if (sampling.includes("policyOrigin = 'AUTOMATIC_PLANNER'\n    plannerReason = 'EXPLICIT_POLICY_PRESERVED'")) {
  throw new Error('Explicit dataset sampling policies must remain authoritative.')
}
if (metricEngine.includes("rows.length < loaded.rowCount ? 'SAMPLE' : 'FULL_DATASET'")) {
  throw new Error('Duplicate metric evidence basis must not infer full-source coverage from row-count equality.')
}

console.log('Adaptive sampling planner truth, authority, and duplicate metric evidence contracts verified.')
