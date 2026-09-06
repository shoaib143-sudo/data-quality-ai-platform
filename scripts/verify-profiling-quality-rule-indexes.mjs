import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260906154500_harden_profiling_quality_rule_fk_indexes.sql', 'utf8')

const requiredIndexes = [
  ['quality_rule_definitions_current_version_fk_idx', 'profiling.quality_rule_definitions (current_version_id)'],
  ['quality_rule_runs_rule_version_fk_idx', 'profiling.quality_rule_runs (rule_version_id)'],
  ['quality_rule_run_events_rule_definition_fk_idx', 'profiling.quality_rule_run_events (rule_definition_id)'],
  ['quality_rule_run_events_rule_version_fk_idx', 'profiling.quality_rule_run_events (rule_version_id)'],
]

for (const [name, target] of requiredIndexes) {
  if (!migration.includes(`create index if not exists ${name}`)) throw new Error(`Missing profiling quality-rule index: ${name}`)
  if (!migration.includes(`on ${target}`)) throw new Error(`Profiling quality-rule index ${name} does not cover expected FK target ${target}`)
}

for (const forbidden of [/drop\s+index/i, /drop\s+table/i, /alter\s+table[\s\S]*drop/i, /create\s+unique\s+index/i]) {
  if (forbidden.test(migration)) throw new Error(`Profiling quality-rule index migration contains destructive or authority-changing SQL: ${forbidden}`)
}

console.log(`Profiling quality-rule FK index hardening verified: ${requiredIndexes.length} targeted covering indexes.`)
