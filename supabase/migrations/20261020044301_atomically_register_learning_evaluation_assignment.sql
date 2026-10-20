-- Keep locked policy creation and its trusted evaluator assignment in one
-- transaction. Any assignment failure rolls back the policy insert as well.
create or replace function agent.record_learning_evaluation_policy_with_assignment(
  p_policy_input jsonb,
  p_proposer_user_id uuid,
  p_evaluator_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
declare
  v_policy record;
  v_policy_id uuid;
  v_existing_policy_id uuid;
begin
  if p_policy_input is null or jsonb_typeof(p_policy_input) <> 'object'
    or p_proposer_user_id is null or p_evaluator_user_id is null then
    raise exception 'policy input and authenticated assignment identities are required';
  end if;
  if p_proposer_user_id = p_evaluator_user_id then
    raise exception 'proposer and evaluator must be distinct';
  end if;

  select * into v_policy
  from jsonb_to_record(p_policy_input) as policy_input(
    p_project_id uuid,
    p_candidate_id uuid,
    p_policy_key text,
    p_agent_key text,
    p_skill_key text,
    p_mode text,
    p_dataset_version_ids text[],
    p_dataset_manifest_id uuid,
    p_baseline_version text,
    p_candidate_version text,
    p_rollback_ref text,
    p_evaluator_actor_id text,
    p_proposer_actor_id text,
    p_rubric_ref text,
    p_calibration_ref text,
    p_manifest_hash text,
    p_locked_at timestamptz,
    p_primary_metric text,
    p_analysis_plan_ref text,
    p_sample_size integer,
    p_minimum_gain numeric,
    p_minimum_score numeric,
    p_total_cost_budget numeric,
    p_per_run_cost_budget numeric,
    p_total_token_budget bigint,
    p_per_run_token_budget bigint,
    p_latency_ms_budget integer
  );

  if lower(btrim(v_policy.p_proposer_actor_id)) <> p_proposer_user_id::text
    or lower(btrim(v_policy.p_evaluator_actor_id)) <> p_evaluator_user_id::text then
    raise exception 'policy actors do not match authenticated assignment identities';
  end if;

  select id into v_existing_policy_id
  from agent.learning_evaluation_policies
  where project_id = v_policy.p_project_id and policy_key = btrim(v_policy.p_policy_key)
  for update;
  if found and not exists (
    select 1 from agent.learning_evaluation_assignments where policy_id = v_existing_policy_id
  ) then
    raise exception 'legacy unassigned evaluation policies cannot be retroactively trusted';
  end if;

  v_policy_id := agent.record_learning_evaluation_policy(
    v_policy.p_project_id,
    v_policy.p_candidate_id,
    v_policy.p_policy_key,
    v_policy.p_agent_key,
    v_policy.p_skill_key,
    v_policy.p_mode,
    v_policy.p_dataset_version_ids,
    v_policy.p_dataset_manifest_id,
    v_policy.p_baseline_version,
    v_policy.p_candidate_version,
    v_policy.p_rollback_ref,
    v_policy.p_evaluator_actor_id,
    v_policy.p_proposer_actor_id,
    v_policy.p_rubric_ref,
    v_policy.p_calibration_ref,
    v_policy.p_manifest_hash,
    v_policy.p_locked_at,
    v_policy.p_primary_metric,
    v_policy.p_analysis_plan_ref,
    v_policy.p_sample_size,
    v_policy.p_minimum_gain,
    v_policy.p_minimum_score,
    v_policy.p_total_cost_budget,
    v_policy.p_per_run_cost_budget,
    v_policy.p_total_token_budget,
    v_policy.p_per_run_token_budget,
    v_policy.p_latency_ms_budget
  );

  perform agent.record_learning_evaluation_assignment(
    v_policy_id,
    v_policy.p_project_id,
    v_policy.p_candidate_id,
    p_proposer_user_id,
    p_evaluator_user_id,
    p_proposer_user_id
  );
  return v_policy_id;
end;
$$;

revoke all on function agent.record_learning_evaluation_policy_with_assignment(jsonb,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function agent.record_learning_evaluation_policy_with_assignment(jsonb,uuid,uuid)
  to service_role;

comment on function agent.record_learning_evaluation_policy_with_assignment(jsonb,uuid,uuid) is
  'Atomically records a locked evaluation policy and its UUID-backed evaluator assignment.';
