-- Persist evaluator observations against one immutable, completed dispatch.
-- These rows are evidence inputs only. They do not produce an evaluation
-- decision, release attestation, or permission to promote a candidate.
alter table agent.learning_evaluation_assignment_acknowledgements
  add constraint learning_evaluation_ack_score_binding_uq
  unique (id, assignment_id, policy_id, project_id, candidate_id, evaluator_user_id, scope_digest);

create table agent.learning_experiment_attempt_scores (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null unique references agent.learning_experiment_dispatch_claims(id) on delete restrict,
  project_id uuid not null,
  policy_id uuid not null,
  candidate_id uuid not null,
  run_id uuid not null,
  assignment_id uuid not null,
  acknowledgement_id uuid not null,
  evaluator_user_id uuid not null,
  assignment_scope_digest text not null check (assignment_scope_digest ~ '^sha256:[0-9a-f]{64}$'),
  input_hash text not null check (input_hash ~ '^sha256:[0-9a-f]{64}$'),
  output_hash text not null check (output_hash ~ '^sha256:[0-9a-f]{64}$'),
  artifact_hash text not null check (artifact_hash ~ '^sha256:[0-9a-f]{64}$'),
  execution_manifest_hash text not null check (execution_manifest_hash ~ '^sha256:[0-9a-f]{64}$'),
  rubric_ref text not null check (length(btrim(rubric_ref)) > 0),
  rubric_digest text not null check (rubric_digest ~ '^sha256:[0-9a-f]{64}$'),
  calibration_ref text not null check (length(btrim(calibration_ref)) > 0),
  calibration_digest text not null check (calibration_digest ~ '^sha256:[0-9a-f]{64}$'),
  criterion_scores jsonb not null check (jsonb_typeof(criterion_scores) = 'array'),
  overall_score numeric not null check (overall_score >= 0 and overall_score <= 1),
  observed_at timestamptz not null default clock_timestamp(),
  constraint learning_attempt_score_scope_fk
    foreign key (assignment_id, policy_id, project_id, candidate_id, evaluator_user_id, assignment_scope_digest)
    references agent.learning_evaluation_assignments
      (id, policy_id, project_id, candidate_id, evaluator_user_id, scope_digest) on delete restrict,
  constraint learning_attempt_score_ack_fk
    foreign key (acknowledgement_id, assignment_id, policy_id, project_id, candidate_id, evaluator_user_id, assignment_scope_digest)
    references agent.learning_evaluation_assignment_acknowledgements
      (id, assignment_id, policy_id, project_id, candidate_id, evaluator_user_id, scope_digest) on delete restrict
);

create index learning_attempt_score_policy_idx
  on agent.learning_experiment_attempt_scores(policy_id, project_id, candidate_id, run_id);
alter table agent.learning_experiment_attempt_scores enable row level security;
revoke all on agent.learning_experiment_attempt_scores from public, anon, authenticated, service_role;
grant select on agent.learning_experiment_attempt_scores to service_role;
create trigger learning_attempt_scores_immutable
before update or delete on agent.learning_experiment_attempt_scores
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create function agent.record_learning_experiment_attempt_score(
  p_claim_id uuid,
  p_evaluator_user_id uuid,
  p_assignment_id uuid,
  p_acknowledgement_id uuid,
  p_output_hash text,
  p_rubric_digest text,
  p_calibration_digest text,
  p_criterion_scores jsonb,
  p_overall_score numeric
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent
as $function$
declare
  v_claim agent.learning_experiment_dispatch_claims%rowtype;
  v_outcome agent.learning_experiment_dispatch_outcomes%rowtype;
  v_policy agent.learning_evaluation_policies%rowtype;
  v_assignment agent.learning_evaluation_assignments%rowtype;
  v_ack agent.learning_evaluation_assignment_acknowledgements%rowtype;
  v_existing agent.learning_experiment_attempt_scores%rowtype;
  v_item jsonb;
  v_criterion_key text;
  v_criterion_score numeric;
  v_score_id uuid;
  v_score_key_count integer;
  v_distinct_score_key_count integer;
begin
  if p_claim_id is null or p_evaluator_user_id is null or p_assignment_id is null
    or p_acknowledgement_id is null or p_output_hash is null
    or p_rubric_digest is null or p_calibration_digest is null or p_criterion_scores is null
    or p_output_hash !~ '^sha256:[0-9a-f]{64}$'
    or p_rubric_digest !~ '^sha256:[0-9a-f]{64}$'
    or p_calibration_digest !~ '^sha256:[0-9a-f]{64}$'
    or jsonb_typeof(p_criterion_scores) <> 'array'
    or jsonb_array_length(p_criterion_scores) = 0
    or jsonb_array_length(p_criterion_scores) > 50
    or p_overall_score is null or p_overall_score < 0 or p_overall_score > 1 then
    raise exception 'INVALID_ATTEMPT_SCORE';
  end if;
  select count(*), count(distinct value->>'key')
    into v_score_key_count, v_distinct_score_key_count
  from jsonb_array_elements(p_criterion_scores);
  if v_score_key_count <> v_distinct_score_key_count then
    raise exception 'INVALID_ATTEMPT_SCORE';
  end if;

  for v_item in select value from jsonb_array_elements(p_criterion_scores)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or jsonb_typeof(v_item->'key') <> 'string'
      or length(btrim(v_item->>'key')) = 0
      or length(btrim(v_item->>'key')) > 100
      or jsonb_typeof(v_item->'score') <> 'number' then
      raise exception 'INVALID_ATTEMPT_SCORE';
    end if;
    v_criterion_key := v_item->>'key';
    begin
      v_criterion_score := (v_item->>'score')::numeric;
    exception when others then
      raise exception 'INVALID_ATTEMPT_SCORE';
    end;
    if v_criterion_score < 0 or v_criterion_score > 1
      or (v_item - 'key' - 'score') <> '{}'::jsonb
      then
      raise exception 'INVALID_ATTEMPT_SCORE';
    end if;
  end loop;

  select * into v_claim from agent.learning_experiment_dispatch_claims
  where id = p_claim_id for update;
  if not found then raise exception 'DISPATCH_CLAIM_NOT_FOUND'; end if;
  select * into v_outcome from agent.learning_experiment_dispatch_outcomes
  where claim_id = p_claim_id;
  if not found or v_outcome.status <> 'completed' or v_outcome.outcome is null then
    raise exception 'COMPLETED_DISPATCH_REQUIRED';
  end if;
  if v_outcome.outcome #>> '{output,hash}' is distinct from p_output_hash
    or v_outcome.outcome #>> '{output,bytes}' is null
    or ('sha256:' || encode(sha256(convert_to(v_outcome.outcome #>> '{output,bytes}', 'UTF8')), 'hex'))
      is distinct from v_outcome.outcome #>> '{output,hash}' then
    raise exception 'OUTPUT_BINDING_MISMATCH';
  end if;
  select * into v_policy from agent.learning_evaluation_policies
  where id = v_claim.policy_id and project_id = v_claim.project_id and candidate_id = v_claim.candidate_id;
  if not found then raise exception 'POLICY_BINDING_MISMATCH'; end if;
  if lower(btrim(v_policy.evaluator_actor_id)) is distinct from p_evaluator_user_id::text
    or lower(btrim(v_policy.proposer_actor_id)) = p_evaluator_user_id::text then
    raise exception 'EVALUATOR_ASSIGNMENT_MISMATCH';
  end if;
  select * into v_assignment from agent.learning_evaluation_assignments
  where id = p_assignment_id and policy_id = v_claim.policy_id
    and project_id = v_claim.project_id and candidate_id = v_claim.candidate_id
    and evaluator_user_id = p_evaluator_user_id;
  if not found then raise exception 'EVALUATOR_ASSIGNMENT_MISMATCH'; end if;
  select * into v_ack from agent.learning_evaluation_assignment_acknowledgements
  where id = p_acknowledgement_id and assignment_id = v_assignment.id
    and policy_id = v_claim.policy_id and project_id = v_claim.project_id
    and candidate_id = v_claim.candidate_id and evaluator_user_id = p_evaluator_user_id
    and scope_digest = v_assignment.scope_digest;
  if not found or v_ack.acknowledged_by_user_id <> p_evaluator_user_id
    or v_ack.acknowledged_at < v_assignment.assigned_at
    or v_ack.acknowledged_at > statement_timestamp() then
    raise exception 'EVALUATOR_ACKNOWLEDGEMENT_MISMATCH';
  end if;
  if p_rubric_digest is null or p_calibration_digest is null
    or nullif(btrim(v_policy.rubric_ref), '') is null
    or nullif(btrim(v_policy.calibration_ref), '') is null then
    raise exception 'LOCKED_EVALUATOR_CONFIGURATION_REQUIRED';
  end if;

  select * into v_existing from agent.learning_experiment_attempt_scores where claim_id = p_claim_id;
  if found then
    if v_existing.evaluator_user_id = p_evaluator_user_id
      and v_existing.assignment_id = v_assignment.id
      and v_existing.acknowledgement_id = v_ack.id
      and v_existing.assignment_scope_digest = v_assignment.scope_digest
      and v_existing.output_hash = p_output_hash
      and v_existing.rubric_ref = v_policy.rubric_ref
      and v_existing.rubric_digest = p_rubric_digest
      and v_existing.calibration_ref = v_policy.calibration_ref
      and v_existing.calibration_digest = p_calibration_digest
      and v_existing.criterion_scores = p_criterion_scores
      and v_existing.overall_score = p_overall_score then
      return v_existing.id;
    end if;
    raise exception 'ATTEMPT_SCORE_CONFLICT';
  end if;

  insert into agent.learning_experiment_attempt_scores(
    claim_id, project_id, policy_id, candidate_id, run_id,
    assignment_id, acknowledgement_id, evaluator_user_id, assignment_scope_digest,
    input_hash, output_hash, artifact_hash, execution_manifest_hash,
    rubric_ref, rubric_digest, calibration_ref, calibration_digest,
    criterion_scores, overall_score
  ) values (
    v_claim.id, v_claim.project_id, v_claim.policy_id, v_claim.candidate_id, v_claim.run_id,
    v_assignment.id, v_ack.id, p_evaluator_user_id, v_assignment.scope_digest,
    v_claim.input_hash, p_output_hash, v_claim.artifact_hash, v_claim.execution_manifest_hash,
    v_policy.rubric_ref, p_rubric_digest, v_policy.calibration_ref, p_calibration_digest,
    p_criterion_scores, p_overall_score
  ) returning id into v_score_id;
  return v_score_id;
end;
$function$;

revoke all on function agent.record_learning_experiment_attempt_score(uuid,uuid,uuid,uuid,text,text,text,jsonb,numeric)
  from public, anon, authenticated, service_role;
grant execute on function agent.record_learning_experiment_attempt_score(uuid,uuid,uuid,uuid,text,text,text,jsonb,numeric)
  to service_role;
comment on function agent.record_learning_experiment_attempt_score(uuid,uuid,uuid,uuid,text,text,text,jsonb,numeric) is
  'Stores an immutable evaluator score for one completed dispatch. The caller must authenticate the evaluator and check current project capability. This RPC records evidence only and cannot create a learning decision or attestation.';
