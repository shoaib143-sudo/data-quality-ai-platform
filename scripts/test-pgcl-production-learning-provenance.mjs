import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync(
  'supabase/migrations/20260920016000_pgcl_production_learning_provenance.sql',
  'utf8',
)
const runtime = fs.readFileSync('lib/agents/proactive-governed-case-learning-runtime.ts', 'utf8')
const provenance = fs.readFileSync('lib/agents/pgcl-run-learning-provenance.ts', 'utf8')

for (const invariant of [
  'create table if not exists agent.agent_run_learning_provenance',
  "classification in ('PRODUCTION_ELIGIBLE','SYNTHETIC_OR_TEST')",
  "classification_source = 'PGCL_GOVERNED_RUNTIME'",
  'production_eligible boolean not null',
  'synthetic_or_test_detected boolean not null',
  'reject_agent_run_learning_provenance_mutation',
  'alter table agent.agent_run_learning_provenance enable row level security',
  'app_private.is_project_member(project_id)',
  'add column if not exists production_eligible boolean not null default false',
  'add column if not exists learning_provenance_recorded_at timestamptz',
  'create or replace function agent.record_pgcl_run_learning_provenance',
  "v_run.status <> 'SUCCEEDED'",
  "v_run.input->>'synthetic'",
  "v_run.input->>'synthetic_bootstrap'",
  "v_run.input->>'acceptance_test'",
  "v_run.input->>'smokeTest'",
  "v_run.input->>'smoke_test'",
  "v_dataset_metadata->>'synthetic'",
  "v_version_metadata->>'synthetic'",
  "v_source_metadata->>'synthetic'",
  "v_project_metadata->>'synthetic'",
  "v_project_metadata->>'synthetic_bootstrap'",
  "v_project_metadata->>'test_fixture'",
  "v_project_metadata->>'created_via'",
  "'backend_regression_test'",
  "'synthetic_fixture'",
  "'test_fixture'",
  "v_parent.input->>'synthetic'",
  "'SYNTHETIC_OR_TEST'",
  "'SOURCE_RUN_OR_DATA_PROVENANCE_MARKED_SYNTHETIC_OR_TEST'",
  'create or replace function agent.enforce_pgcl_production_learning_provenance',
  'PGCL source run has no trusted production learning provenance',
  'synthetic or test evidence is not eligible for PGCL production learning',
  'before insert on agent.positive_learning_cases',
  'before insert on agent.positive_learning_case_occurrences',
  'create or replace function agent.enforce_pgcl_production_approval',
  'unclassified or non-production PGCL evidence cannot be approved for reusable learning',
  'PGCL production-learning provenance is immutable',
  'plc.production_eligible = true',
  'plc.learning_provenance_recorded_at is not null',
]) {
  assert.ok(migration.includes(invariant), `missing PGCL production-provenance invariant: ${invariant}`)
}

for (const invariant of [
  'recordPgclRunLearningProvenance',
  "rpc('record_pgcl_run_learning_provenance'",
  "result.classification !== 'PRODUCTION_ELIGIBLE'",
  'result.productionEligible !== true',
  'result.syntheticOrTestDetected !== false',
  'PGCL source run is not eligible for production learning',
]) {
  assert.ok(provenance.includes(invariant), `missing trusted provenance adapter invariant: ${invariant}`)
}

const directProvenance = runtime.indexOf('await recordPgclRunLearningProvenance({')
const directPersist = runtime.indexOf('const candidateId = await persistProactiveGovernedCaseLearningCandidate({')
assert.ok(directProvenance >= 0 && directPersist > directProvenance, 'direct PGCL provenance must precede persistence')

const supervisorFunction = runtime.indexOf('export async function proposePgclCasesFromVerifiedSupervisorRun')
const supervisorProvenance = runtime.indexOf('await recordPgclRunLearningProvenance({', supervisorFunction)
const supervisorPersist = runtime.indexOf('candidateIds.push(await persistProactiveGovernedCaseLearningCandidate({', supervisorFunction)
assert.ok(
  supervisorFunction >= 0 && supervisorProvenance > supervisorFunction && supervisorPersist > supervisorProvenance,
  'supervisor PGCL provenance must precede persistence',
)

for (const forbidden of [
  'grant insert on agent.agent_run_learning_provenance to authenticated',
  'grant update on agent.agent_run_learning_provenance',
  'production_eligible boolean not null default true',
]) {
  assert.equal(migration.includes(forbidden), false, `unsafe PGCL provenance contract: ${forbidden}`)
}

console.log('PGCL production learning now requires immutable trusted non-synthetic run provenance before case persistence or reuse.')
