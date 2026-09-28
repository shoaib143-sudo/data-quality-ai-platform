import assert from 'node:assert/strict'
import fs from 'node:fs'

const migration = fs.readFileSync('supabase/migrations/20260929000250_agent_run_outcome_coverage.sql', 'utf8')
const provenance = [
  'supabase/migrations/20260920016000_pgcl_production_learning_provenance.sql',
  'supabase/migrations/20260929000225_pgcl_terminal_run_learning_provenance.sql',
].map((path) => fs.readFileSync(path, 'utf8')).join('\n')

for (const invariant of [
  'create table if not exists agent.agent_run_outcome_coverage',
  "terminal_status text not null check (terminal_status in ('SUCCEEDED','COMPLETED','PARTIAL','FAILED','CANCELLED'))",
  "run_mode text not null check (run_mode in ('SUPERVISED','HANDSFREE','GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS','OFF','UNCLASSIFIED'))",
  "provenance_status text not null check (provenance_status in ('PRODUCTION_ELIGIBLE','SYNTHETIC_OR_TEST','NOT_RECORDED'))",
  'agent.learning_prospective_outcomes',
  'awaiting_verified_outcome_runs',
  'verified_outcome_runs',
  'reject_agent_run_outcome_coverage_mutation',
  'create or replace function agent.capture_terminal_agent_run_outcome_coverage',
  "new.status::text not in ('SUCCEEDED', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED')",
  "new.input->>'learningRunMode'",
  "new.input->>'run_mode'",
  "upper(new.input->>'learningRunMode') <> upper(new.input->>'run_mode')",
  "v_run_mode := 'UNCLASSIFIED'",
  "v_mode_source := 'UNCLASSIFIED'",
  'verifiedOutcomeRequired',
  'create or replace view agent.agent_run_prospective_outcome_denominator',
  'pending_provenance_runs',
  'non_success_terminal_runs',
]) {
  assert.ok(migration.includes(invariant), `missing outcome coverage invariant: ${invariant}`)
}

assert.ok(
  provenance.includes("v_run.status::text not in ('SUCCEEDED', 'COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED')"),
  'terminal provenance must include failed, partial and cancelled runs',
)
for (const forbidden of [
  'grant insert on agent.agent_run_outcome_coverage to authenticated',
  'grant update on agent.agent_run_outcome_coverage',
  'grant delete on agent.agent_run_outcome_coverage',
]) assert.equal(migration.includes(forbidden), false, `unsafe outcome coverage grant: ${forbidden}`)

console.log('Agent run outcome coverage records terminal failures and derives verified versus pending outcome coverage from immutable prospective evidence.')
