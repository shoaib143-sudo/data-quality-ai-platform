import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260929000200_learning_prospective_outcomes.sql', 'utf8')
const service = fs.readFileSync('lib/agents/governed-learning-prospective-results.ts', 'utf8')
const runtime = fs.readFileSync('lib/agents/proactive-governed-case-learning-runtime.ts', 'utf8')

for (const required of [
  'create table agent.learning_prospective_outcomes',
  'outcome_id uuid primary key references governance.governed_action_outcomes(id)',
  'source_agent_run_id uuid not null references agent.agent_runs(id)',
  "check (run_mode <> 'UNCLASSIFIED' or mode_source = 'MISSING_OR_UNRECOGNIZED')",
  'reject_learning_prospective_outcome_mutation',
  'create function agent.collect_learning_prospective_outcome(p_outcome_id uuid)',
  'agent_run_learning_provenance',
  'create trigger collect_learning_prospective_on_outcome_insert',
  'create trigger collect_learning_prospective_on_provenance_insert',
  'create function agent.summarize_learning_prospective_outcomes(p_project_id uuid)',
  'grant execute on function agent.collect_learning_prospective_outcome(uuid) to service_role',
]) {
  assert.ok(migration.includes(required), `prospective migration must contain: ${required}`)
}

for (const required of [
  "rpc('summarize_learning_prospective_outcomes'",
  'sampleCount: Number(row.sample_count)',
  'meanEffectiveness:',
]) {
  assert.ok(service.includes(required), `prospective read service must contain: ${required}`)
}

for (const required of ['recordPgclRunLearningProvenance', 'persistProactiveGovernedCaseLearningCandidate']) {
  assert.ok(runtime.includes(required), `PGCL runtime must retain: ${required}`)
}

assert.match(migration, /outcome_type = 'EFFECTIVE'/)
assert.match(migration, /outcome_type = 'INEFFECTIVE'/)
assert.match(migration, /outcome_type = 'PARTIAL'/)
assert.match(migration, /outcome_type not in \('EFFECTIVE','INEFFECTIVE','PARTIAL'\)/)
assert.match(migration, /not p\.synthetic_or_test_detected/)

console.log('Governed learning prospective outcome contract passed')
