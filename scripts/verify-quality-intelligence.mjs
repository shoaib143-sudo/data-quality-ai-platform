import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`Missing quality intelligence artifact: ${path}`)
  return fs.readFileSync(path, 'utf8')
}

function requireText(path, patterns) {
  const source = read(path)
  for (const pattern of patterns) {
    if (!source.includes(pattern)) throw new Error(`${path} is missing quality intelligence contract: ${pattern}`)
  }
}

requireText('supabase/migrations/20260904213853_quality_intelligence_profile_evaluation.sql', [
  'evaluate_profile_quality_intelligence',
  'quality_rule_runs_system_profile_uq',
  'profile_anomalies_quality_intelligence_uq',
  'profile_comparisons',
  'quality_intelligence_engine',
  'METRIC_DRIFT',
  'VOLUME_DRIFT',
  'QUALITY_RULE_FAILURE',
  'evaluate_freshness_intelligence',
  'PROFILE_OBSERVATION_FRESHNESS',
  'refresh_quality_intelligence',
  'trg_profile_completed_quality_intelligence',
  'dgp-quality-intelligence-refresh',
])

requireText('supabase/migrations/20260904213920_fix_quality_intelligence_freshness_format.sql', [
  'evaluate_freshness_intelligence',
  "format('The latest completed profiling observation is %s hours old versus a governed %s hour SLA.'",
  'PROFILE_OBSERVATION_FRESHNESS',
])

requireText('app/api/data-quality/intelligence/route.ts', [
  "authorizeProject(user.id, projectId, 'quality.read')",
  "authorizeProject(user.id, projectId, 'quality.execute')",
  'quality_rule_runs',
  'profile_comparisons',
  'profile_anomalies',
  'observability_alerts',
  'evaluate_profile_quality_intelligence',
  'refresh_quality_intelligence',
  'freshnessBreached',
])

console.log('Quality intelligence contracts verified.')
