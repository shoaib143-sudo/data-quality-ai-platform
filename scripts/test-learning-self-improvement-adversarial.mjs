import assert from 'node:assert/strict'
import fs from 'node:fs'

const bindings = fs.readFileSync('supabase/migrations/20260929000100_learning_benchmark_case_bindings.sql', 'utf8')
const prospective = fs.readFileSync('supabase/migrations/20260929000200_learning_prospective_outcomes.sql', 'utf8')

const requireAll = (source, label, tokens) => {
  for (const token of tokens) assert.ok(source.includes(token), `${label} is missing invariant: ${token}`)
}

requireAll(bindings, 'paired benchmark binding', [
  "check (case_key ~ '^[a-f0-9]{64}$')",
  'unique (project_id, evaluation_id)',
  "benchmark_split' is distinct from 'HELD_OUT'",
  "learning_candidate_id' is distinct from new.candidate_id::text",
  "metadata->>'synthetic' is distinct from 'false'",
  "metadata->>'synthetic_bootstrap' = 'true'",
  "v_eval.created_at < v_candidate.evidence_cutoff_at",
  "v_eval.observed_at < v_candidate.evidence_cutoff_at",
  'held-out case overlaps candidate source evidence',
  'paired benchmark aggregate does not match bound evaluations',
  'reject_learning_benchmark_case_binding_mutation',
  'revoke all on agent.learning_benchmark_case_bindings from public, anon, authenticated, service_role',
])

requireAll(prospective, 'prospective outcome collection', [
  "v_outcome.verification_state <> 'VERIFIED' or v_outcome.source_agent_run_id is null",
  "p.production_eligible and p.classification = 'PRODUCTION_ELIGIBLE'",
  'not p.synthetic_or_test_detected',
  "v_run.input->>'learningRunMode'",
  "v_run.input->>'run_mode'",
  'collect_learning_prospective_on_outcome_verify',
  "after update of verification_state on governance.governed_action_outcomes",
  "new.verification_state = 'VERIFIED'",
  "v_mode := 'UNCLASSIFIED'",
  'outcome_id, project_id, source_agent_run_id',
  'on conflict (outcome_id) do nothing',
  'reject_learning_prospective_outcome_mutation',
  'revoke all on agent.learning_prospective_outcomes from public, anon, authenticated, service_role',
  'grant execute on function agent.collect_learning_prospective_outcome(uuid) to service_role',
  'verified_at <= recorded_at',
])

assert.equal(prospective.includes('grant insert on agent.learning_prospective_outcomes'), false,
  'prospective outcome rows must only be inserted by SECURITY DEFINER collectors')
assert.equal(bindings.includes('grant insert on agent.learning_benchmark_case_bindings'), false,
  'benchmark bindings must only be inserted by the immutable benchmark trigger')
assert.equal(prospective.includes("v_outcome.verification_agent_run_id"), false,
  'prospective attribution must never use the verifier run as the source agent')
assert.equal(prospective.includes("where id = v_outcome.source_agent_run_id and project_id = v_outcome.project_id"), true,
  'source run lookup must be project scoped')

console.log('Self-improvement evidence paths fail closed for synthetic data, cross-project references, held-out leakage, mode ambiguity, mutation, and unauthorized direct writes.')
