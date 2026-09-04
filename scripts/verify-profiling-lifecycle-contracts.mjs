import { readFile } from 'node:fs/promises'

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8')
}

function requireMatch(text, pattern, message) {
  if (!pattern.test(text)) throw new Error(message)
}

const [metricEngine, persistenceMigration, validatorMigration, databaseVerifier] = await Promise.all([
  source('lib/profiling/metric-engine.ts'),
  source('supabase/migrations/20260904233902_preserve_precise_profiling_overall_score.sql'),
  source('supabase/migrations/20260904234230_strengthen_metric_execution_score_contract.sql'),
  source('scripts/verify-governance-database.mjs'),
])

requireMatch(metricEngine, /function\s+isBlank\(value:\s*unknown\)/, 'Profiling engine must explicitly model blank strings.')
requireMatch(metricEngine, /completenessMissingCount\s*=\s*nullCount\s*\+\s*blankCount/, 'Profiling completeness must include null and blank values exactly once.')
requireMatch(metricEngine, /completeness_rate:\s*round\(completenessRate\)/, 'Column profiling output must expose blank-aware completeness.')
requireMatch(metricEngine, /sum\s*\+\s*result\.completeness_rate/, 'Overall completeness must aggregate blank-aware column completeness.')
requireMatch(metricEngine, /candidateKeyConfidence\s*=.*completenessMissingRate/, 'Candidate-key confidence must account for blank-aware missingness.')
requireMatch(metricEngine, /persist_profiling_results/, 'Profiling metric execution must use atomic result persistence.')

requireMatch(persistenceMigration, /v_requested_overall_score\s*:=\s*nullif\(p_score->>'overall_score'/, 'Atomic persistence must preserve the requested engine overall score.')
requireMatch(persistenceMigration, /abs\(v_requested_overall_score\s*-\s*v_component_overall_score\)\s*>\s*0\.0002/, 'Atomic persistence must reject materially inconsistent overall scores.')
requireMatch(persistenceMigration, /jsonb_build_object\('overall_score',\s*v_overall_score\)/, 'Atomic persistence must canonicalize the summary overall score.')
requireMatch(persistenceMigration, /validate_metric_execution_contract\(p_profile_run_id\)/, 'Completed profiling persistence must validate the execution contract before commit.')

for (const invariant of ['metric_contract_valid', 'score_present', 'score_values_valid', 'score_consistent', 'completed_facts_present']) {
  requireMatch(validatorMigration, new RegExp(`'${invariant}'`), `Metric execution validator must expose ${invariant}.`)
}
requireMatch(validatorMigration, /v_run_column_count\s*=\s*profile_column_count/, 'Completed profile facts must agree with persisted profile-column cardinality.')
requireMatch(validatorMigration, /nullif\(v_run_schema_hash,\s*''\)\s+is\s+not\s+null/, 'Completed profile contract must require a schema hash.')
requireMatch(validatorMigration, /v_summary_overall\s+is\s+not\s+distinct\s+from\s+v_overall/, 'Summary and persisted overall scores must be identical.')

requireMatch(databaseVerifier, /latestProfileByDatasetVersion/, 'Live database verification must inspect the latest completed profile for each dataset version.')
requireMatch(databaseVerifier, /rpc\('validate_metric_execution_contract'/, 'Live database verification must execute the profiling contract validator.')
requireMatch(databaseVerifier, /score_consistent/, 'Live database verification must gate score consistency.')
requireMatch(databaseVerifier, /completed_facts_present/, 'Live database verification must gate completed profiling facts.')

console.log(JSON.stringify({
  valid: true,
  contracts: {
    blankAwareCompleteness: true,
    blankAwareCandidateKeys: true,
    atomicProfilingPersistence: true,
    preciseOverallScore: true,
    canonicalSummaryScore: true,
    scoreConsistencyValidation: true,
    completedFactValidation: true,
    latestEstateValidation: true,
  },
}, null, 2))
