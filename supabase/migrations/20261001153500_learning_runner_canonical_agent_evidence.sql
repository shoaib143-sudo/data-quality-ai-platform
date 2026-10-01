-- Bind prospective learning experiment attempts to canonical agent runs and
-- content-addressed result artifacts. This extends the paired runner core without
-- introducing a second execution or artifact store.

alter table agent.learning_experiment_attempts
  add column if not exists result_artifact_id uuid references agent.agent_artifacts(id) on delete restrict,
  add column if not exists result_content_hash text,
  add constraint learning_experiment_attempt_result_hash_ck
    check (result_content_hash is null or result_content_hash ~ '^sha256:[a-f0-9]{64}$');

-- run_id was created as a durable UUID in the runner core. From this migration
-- forward it is also the canonical agent.agent_runs identity.
alter table agent.learning_experiment_attempts
  add constraint learning_experiment_attempt_run_fk
    foreign key (run_id) references agent.agent_runs(id) on delete restrict;

create index if not exists learning_experiment_attempt_result_artifact_idx
  on agent.learning_experiment_attempts(result_artifact_id)
  where result_artifact_id is not null;

create or replace function agent.prepare_learning_experiment_attempt(
  p_project_id uuid,
  p_policy_id uuid,
  p_candidate_id uuid,
  p_dataset_manifest_id uuid,
  p_case_key text,
  p_arm text,
  p_agent_definition_id uuid,
  p_version text,
  p_input_evidence_ref text,
  p_synthetic boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, agent, extensions
as $$
declare
  v_policy agent.learning_evaluation_policies%rowtype;
  v_candidate agent.learning_candidates%rowtype;
  v_case agent.learning_benchmark_dataset_cases%rowtype;
  v_definition agent.agent_definitions%rowtype;
  v_attempt agent.learning_experiment_attempts%rowtype;
  v_agent_run agent.agent_runs%rowtype;
  v_expected_version text;
  v_execution_key text;
  v_run_id uuid;
begin
  if p_project_id is null or p_policy_id is null or p_candidate_id is null
    or p_dataset_manifest_id is null or p_agent_definition_id is null
  then raise exception 'project, policy, candidate, manifest and agent definition are required'; end if;
  if p_case_key is null or p_case_key !~ '^[a-f0-9]{64}$' then raise exception 'held-out case key must be SHA-256'; end if;
  if p_arm not in ('BASELINE','CANDIDATE') then raise exception 'experiment arm must be BASELINE or CANDIDATE'; end if;
  if length(btrim(coalesce(p_version,''))) = 0 or length(btrim(coalesce(p_input_evidence_ref,''))) = 0 then
    raise exception 'version and input evidence reference are required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    'learning-experiment-attempt:' || p_policy_id::text || ':' || p_case_key || ':' || p_arm, 0
  ));

  select * into v_policy
  from agent.learning_evaluation_policies
  where id = p_policy_id and project_id = p_project_id and candidate_id = p_candidate_id;
  if not found then raise exception 'learning evaluation policy not found for candidate'; end if;

  if v_policy.dataset_manifest_id <> p_dataset_manifest_id then
    raise exception 'experiment manifest does not match locked evaluation policy';
  end if;
  if exists (
    select 1 from agent.learning_evaluation_policies newer
    where newer.project_id = p_project_id and newer.candidate_id = p_candidate_id
      and newer.id <> p_policy_id and newer.created_at >= v_policy.created_at
  ) then raise exception 'learning evaluation policy is stale or chronology is ambiguous'; end if;

  select * into v_candidate
  from agent.learning_candidates
  where id = p_candidate_id and project_id = p_project_id;
  if not found then raise exception 'learning candidate not found in project'; end if;
  if v_candidate.agent_key <> v_policy.agent_key or v_candidate.skill_key <> v_policy.skill_key
    or v_candidate.baseline_version <> v_policy.baseline_version
    or v_candidate.candidate_version <> v_policy.candidate_version
  then raise exception 'candidate identity does not match locked evaluation policy'; end if;

  select * into v_case
  from agent.learning_benchmark_dataset_cases
  where project_id = p_project_id and dataset_id = p_dataset_manifest_id
    and case_key = p_case_key and split = 'HELD_OUT';
  if not found then raise exception 'experiment case is not in the locked HELD_OUT manifest'; end if;

  v_expected_version := case when p_arm = 'BASELINE' then v_policy.baseline_version else v_policy.candidate_version end;
  if btrim(p_version) <> v_expected_version then raise exception 'experiment arm version does not match locked policy'; end if;

  select * into v_definition from agent.agent_definitions where id = p_agent_definition_id;
  if not found or v_definition.agent_key <> v_policy.agent_key or v_definition.version <> v_expected_version then
    raise exception 'agent definition does not match locked experiment arm';
  end if;

  v_execution_key := 'sha256:' || encode(extensions.digest(
    p_project_id::text || '|' || p_policy_id::text || '|' || p_case_key || '|' || p_arm || '|' ||
    p_agent_definition_id::text || '|' || v_expected_version || '|' || btrim(p_input_evidence_ref),
    'sha256'
  ), 'hex');

  select * into v_attempt
  from agent.learning_experiment_attempts
  where policy_id = p_policy_id and case_key = p_case_key and arm = p_arm;
  if found then
    if v_attempt.project_id <> p_project_id
      or v_attempt.candidate_id <> p_candidate_id
      or v_attempt.dataset_manifest_id <> p_dataset_manifest_id
      or v_attempt.agent_definition_id <> p_agent_definition_id
      or v_attempt.version <> v_expected_version
      or v_attempt.input_evidence_ref <> btrim(p_input_evidence_ref)
      or v_attempt.synthetic <> coalesce(p_synthetic,false)
      or v_attempt.execution_key <> v_execution_key
    then raise exception 'case/arm attempt already exists with different immutable context'; end if;

    select * into v_agent_run from agent.agent_runs where id=v_attempt.run_id;
    if not found or v_agent_run.project_id <> p_project_id
      or v_agent_run.agent_definition_id <> p_agent_definition_id
    then raise exception 'canonical experiment agent run binding is missing or inconsistent'; end if;

    return jsonb_build_object(
      'attemptId',v_attempt.id,'runId',v_attempt.run_id,'executionKey',v_attempt.execution_key,
      'status',v_attempt.status,'reused',true
    );
  end if;

  v_run_id := gen_random_uuid();
  insert into agent.agent_runs(
    id,agent_definition_id,project_id,correlation_id,status,input
  ) values (
    v_run_id,p_agent_definition_id,p_project_id,v_run_id,'QUEUED',
    jsonb_build_object(
      'execution_mode','governed_learning_experiment',
      'learning_policy_id',p_policy_id,
      'learning_candidate_id',p_candidate_id,
      'learning_dataset_manifest_id',p_dataset_manifest_id,
      'learning_case_key',p_case_key,
      'learning_arm',p_arm,
      'learning_version',v_expected_version,
      'learning_input_evidence_ref',btrim(p_input_evidence_ref),
      'synthetic',coalesce(p_synthetic,false)
    )
  );

  insert into agent.learning_experiment_attempts(
    project_id,policy_id,candidate_id,dataset_manifest_id,case_key,arm,version,agent_definition_id,
    run_id,execution_key,input_evidence_ref,synthetic,status
  ) values (
    p_project_id,p_policy_id,p_candidate_id,p_dataset_manifest_id,p_case_key,p_arm,v_expected_version,
    p_agent_definition_id,v_run_id,v_execution_key,btrim(p_input_evidence_ref),coalesce(p_synthetic,false),'PREPARED'
  ) returning * into v_attempt;

  insert into agent.learning_experiment_attempt_events(
    project_id,attempt_id,event_sequence,from_status,to_status,reason,metadata
  ) values (
    p_project_id,v_attempt.id,1,null,'PREPARED','SERVER_PREPARED_CASE_ARM_IDENTITY',
    jsonb_build_object(
      'caseKey',p_case_key,'arm',p_arm,'executionKey',v_execution_key,
      'synthetic',v_attempt.synthetic,'agentRunId',v_run_id
    )
  );

  return jsonb_build_object(
    'attemptId',v_attempt.id,'runId',v_attempt.run_id,'executionKey',v_attempt.execution_key,
    'status',v_attempt.status,'reused',false
  );
end;
$$;

-- Completion v2 requires the canonical content-addressed AGENT_RUN_RESULT artifact.
-- The earlier completion RPC remains available to the runner-core fixture only;
-- application code in this stacked change uses this stronger binding.
create or replace function agent.complete_learning_experiment_attempt_v2(
  p_project_id uuid,
  p_attempt_id uuid,
  p_execution_key text,
  p_terminal_status text,
  p_result_artifact_id uuid default null,
  p_reservation_id uuid default null,
  p_cost_event_id uuid default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
declare
  v_attempt agent.learning_experiment_attempts%rowtype;
  v_artifact agent.agent_artifacts%rowtype;
  v_run agent.agent_runs%rowtype;
  v_reservation agent.learning_experiment_budget_reservations%rowtype;
  v_settlement agent.learning_experiment_budget_settlements%rowtype;
  v_seq integer;
  v_final_status text;
  v_hash text;
begin
  if p_terminal_status not in ('COMPLETED','FAILED','CANCELLED','RECONCILIATION_REQUIRED') then
    raise exception 'unsupported terminal experiment status';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('learning-experiment-dispatch:' || p_attempt_id::text,0));
  select * into v_attempt from agent.learning_experiment_attempts
    where id=p_attempt_id and project_id=p_project_id for update;
  if not found then raise exception 'learning experiment attempt not found'; end if;
  if v_attempt.execution_key <> p_execution_key then raise exception 'learning experiment execution key mismatch'; end if;

  select * into v_run from agent.agent_runs where id=v_attempt.run_id and project_id=p_project_id;
  if not found or v_run.agent_definition_id <> v_attempt.agent_definition_id then
    raise exception 'canonical experiment agent run binding is missing or inconsistent';
  end if;

  if p_result_artifact_id is not null then
    select * into v_artifact from agent.agent_artifacts
      where id=p_result_artifact_id and agent_run_id=v_attempt.run_id;
    if not found or v_artifact.artifact_type <> 'AGENT_RUN_RESULT'
      or v_artifact.artifact_version <> '1.0'
      or v_artifact.content_hash is null
      or v_artifact.content_hash !~ '^sha256:[a-f0-9]{64}$'
    then raise exception 'canonical experiment result artifact is missing or invalid'; end if;
    v_hash := v_artifact.content_hash;
  end if;

  if v_attempt.status <> 'DISPATCHED' then
    if v_attempt.status = p_terminal_status then
      if v_attempt.result_artifact_id is distinct from p_result_artifact_id
        or v_attempt.result_content_hash is distinct from v_hash
        or v_attempt.reservation_id is distinct from p_reservation_id
        or v_attempt.cost_event_id is distinct from p_cost_event_id
        or v_attempt.last_error_code is distinct from nullif(btrim(coalesce(p_error_code,'')),'')
      then raise exception 'terminal learning experiment evidence conflicts with existing immutable completion'; end if;
      return jsonb_build_object('status',v_attempt.status,'idempotent',true,'runId',v_attempt.run_id);
    end if;
    raise exception 'learning experiment attempt is not in DISPATCHED state';
  end if;

  v_final_status := p_terminal_status;

  if v_final_status='COMPLETED' then
    if p_result_artifact_id is null then
      raise exception 'completed learning experiment attempt requires canonical result artifact';
    end if;
    if v_run.status <> 'SUCCEEDED' or v_run.output is null then
      raise exception 'completed learning experiment requires canonical SUCCEEDED agent run output';
    end if;
  end if;

  if v_attempt.synthetic then
    if p_reservation_id is not null or p_cost_event_id is not null then
      raise exception 'synthetic fixture attempt cannot bind live budget or cost evidence';
    end if;
  else
    if p_reservation_id is null then
      v_final_status := 'RECONCILIATION_REQUIRED';
    else
      select * into v_reservation from agent.learning_experiment_budget_reservations
        where id=p_reservation_id and project_id=p_project_id;
      if not found
        or v_reservation.policy_id <> v_attempt.policy_id
        or v_reservation.candidate_id <> v_attempt.candidate_id
        or v_reservation.run_id <> v_attempt.run_id
        or v_reservation.agent_key <> (select agent_key from agent.learning_evaluation_policies where id=v_attempt.policy_id)
      then v_final_status := 'RECONCILIATION_REQUIRED';
      else
        select * into v_settlement from agent.learning_experiment_budget_settlements
          where reservation_id=p_reservation_id and project_id=p_project_id;
        if not found or v_settlement.status <> 'ACCOUNTED'
          or v_settlement.cost_event_id is null
          or p_cost_event_id is distinct from v_settlement.cost_event_id
        then v_final_status := 'RECONCILIATION_REQUIRED';
        end if;
      end if;
    end if;
  end if;

  update agent.learning_experiment_attempts set
    status=v_final_status,
    result_artifact_id=case when v_final_status='COMPLETED' then p_result_artifact_id else null end,
    result_content_hash=case when v_final_status='COMPLETED' then v_hash else null end,
    output_evidence_ref=case when v_final_status='COMPLETED' then 'agent_result_artifact:' || p_result_artifact_id::text else null end,
    reservation_id=case when v_final_status <> 'RECONCILIATION_REQUIRED' then p_reservation_id else coalesce(p_reservation_id,reservation_id) end,
    cost_event_id=case when v_final_status <> 'RECONCILIATION_REQUIRED' then p_cost_event_id else coalesce(p_cost_event_id,cost_event_id) end,
    last_error_code=nullif(btrim(coalesce(p_error_code,'')),''),
    completed_at=clock_timestamp()
  where id=v_attempt.id returning * into v_attempt;

  select coalesce(max(event_sequence),0)+1 into v_seq
    from agent.learning_experiment_attempt_events where attempt_id=v_attempt.id;
  insert into agent.learning_experiment_attempt_events(
    project_id,attempt_id,event_sequence,from_status,to_status,reason,metadata
  ) values (
    p_project_id,v_attempt.id,v_seq,'DISPATCHED',v_final_status,
    case
      when v_final_status='RECONCILIATION_REQUIRED' then 'CANONICAL_ACCOUNTING_OR_BINDING_INCOMPLETE'
      else 'SERVER_RECORDED_TERMINAL_ATTEMPT'
    end,
    jsonb_build_object(
      'agentRunId',v_attempt.run_id,
      'artifactId',p_result_artifact_id,
      'artifactHash',v_hash,
      'reservationId',p_reservation_id,
      'costEventId',p_cost_event_id,
      'errorCode',nullif(btrim(coalesce(p_error_code,'')),'')
    )
  );

  return jsonb_build_object(
    'status',v_attempt.status,'idempotent',false,'runId',v_attempt.run_id,
    'resultArtifactId',v_attempt.result_artifact_id,'resultContentHash',v_attempt.result_content_hash
  );
end;
$$;

revoke all on function agent.complete_learning_experiment_attempt_v2(uuid,uuid,text,text,uuid,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function agent.complete_learning_experiment_attempt_v2(uuid,uuid,text,text,uuid,uuid,uuid,text)
  to service_role;

comment on column agent.learning_experiment_attempts.result_artifact_id is
  'Canonical AGENT_RUN_RESULT artifact bound to the same agent run as this experiment attempt.';
comment on column agent.learning_experiment_attempts.result_content_hash is
  'Content-addressed SHA-256 hash copied from the canonical result artifact at completion.';


create or replace function agent.reconcile_learning_experiment_attempt(
  p_project_id uuid,
  p_attempt_id uuid,
  p_execution_key text,
  p_result_artifact_id uuid,
  p_reservation_id uuid,
  p_cost_event_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
declare
  v_attempt agent.learning_experiment_attempts%rowtype;
  v_artifact agent.agent_artifacts%rowtype;
  v_run agent.agent_runs%rowtype;
  v_reservation agent.learning_experiment_budget_reservations%rowtype;
  v_settlement agent.learning_experiment_budget_settlements%rowtype;
  v_seq integer;
begin
  if p_project_id is null or p_attempt_id is null or p_result_artifact_id is null
    or p_reservation_id is null or p_cost_event_id is null
  then raise exception 'reconciliation requires project, attempt, artifact, reservation and cost event identities'; end if;

  perform pg_advisory_xact_lock(hashtextextended('learning-experiment-dispatch:' || p_attempt_id::text,0));

  select * into v_attempt from agent.learning_experiment_attempts
    where id=p_attempt_id and project_id=p_project_id for update;
  if not found then raise exception 'learning experiment attempt not found'; end if;
  if v_attempt.execution_key <> p_execution_key then raise exception 'learning experiment execution key mismatch'; end if;

  if v_attempt.status = 'COMPLETED' then
    if v_attempt.result_artifact_id = p_result_artifact_id
      and v_attempt.reservation_id = p_reservation_id
      and v_attempt.cost_event_id = p_cost_event_id
    then
      return jsonb_build_object(
        'status','COMPLETED','idempotent',true,'runId',v_attempt.run_id,
        'resultArtifactId',v_attempt.result_artifact_id,'resultContentHash',v_attempt.result_content_hash
      );
    end if;
    raise exception 'completed learning experiment reconciliation conflicts with immutable evidence';
  end if;

  if v_attempt.status <> 'RECONCILIATION_REQUIRED' then
    raise exception 'learning experiment attempt is not awaiting reconciliation';
  end if;
  if v_attempt.synthetic then
    raise exception 'synthetic experiment attempt cannot use live accounting reconciliation';
  end if;

  select * into v_run from agent.agent_runs
    where id=v_attempt.run_id and project_id=p_project_id;
  if not found or v_run.agent_definition_id <> v_attempt.agent_definition_id
    or v_run.status <> 'SUCCEEDED' or v_run.output is null
  then raise exception 'canonical successful agent run is unavailable for reconciliation'; end if;

  select * into v_artifact from agent.agent_artifacts
    where id=p_result_artifact_id and agent_run_id=v_attempt.run_id;
  if not found or v_artifact.artifact_type <> 'AGENT_RUN_RESULT'
    or v_artifact.artifact_version <> '1.0'
    or v_artifact.content_hash is null
    or v_artifact.content_hash !~ '^sha256:[a-f0-9]{64}$'
  then raise exception 'canonical experiment result artifact is missing or invalid'; end if;

  select * into v_reservation from agent.learning_experiment_budget_reservations
    where id=p_reservation_id and project_id=p_project_id;
  if not found
    or v_reservation.policy_id <> v_attempt.policy_id
    or v_reservation.candidate_id <> v_attempt.candidate_id
    or v_reservation.run_id <> v_attempt.run_id
    or v_reservation.agent_key <> (select agent_key from agent.learning_evaluation_policies where id=v_attempt.policy_id)
  then raise exception 'canonical experiment budget reservation is missing or mismatched'; end if;

  select * into v_settlement from agent.learning_experiment_budget_settlements
    where reservation_id=p_reservation_id and project_id=p_project_id;
  if not found or v_settlement.status <> 'ACCOUNTED'
    or v_settlement.cost_event_id is null
    or v_settlement.cost_event_id <> p_cost_event_id
  then raise exception 'canonical experiment accounting settlement is incomplete or mismatched'; end if;

  update agent.learning_experiment_attempts set
    status='COMPLETED',
    result_artifact_id=p_result_artifact_id,
    result_content_hash=v_artifact.content_hash,
    output_evidence_ref='agent_result_artifact:' || p_result_artifact_id::text,
    reservation_id=p_reservation_id,
    cost_event_id=p_cost_event_id,
    last_error_code=null,
    completed_at=clock_timestamp()
  where id=v_attempt.id
  returning * into v_attempt;

  select coalesce(max(event_sequence),0)+1 into v_seq
  from agent.learning_experiment_attempt_events where attempt_id=v_attempt.id;

  insert into agent.learning_experiment_attempt_events(
    project_id,attempt_id,event_sequence,from_status,to_status,reason,metadata
  ) values (
    p_project_id,v_attempt.id,v_seq,'RECONCILIATION_REQUIRED','COMPLETED',
    'DELAYED_CANONICAL_ACCOUNTING_RECONCILED',
    jsonb_build_object(
      'agentRunId',v_attempt.run_id,
      'artifactId',p_result_artifact_id,
      'artifactHash',v_artifact.content_hash,
      'reservationId',p_reservation_id,
      'costEventId',p_cost_event_id
    )
  );

  return jsonb_build_object(
    'status','COMPLETED','idempotent',false,'runId',v_attempt.run_id,
    'resultArtifactId',v_attempt.result_artifact_id,'resultContentHash',v_attempt.result_content_hash
  );
end;
$$;

revoke all on function agent.reconcile_learning_experiment_attempt(uuid,uuid,text,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function agent.reconcile_learning_experiment_attempt(uuid,uuid,text,uuid,uuid,uuid)
  to service_role;

comment on function agent.reconcile_learning_experiment_attempt(uuid,uuid,text,uuid,uuid,uuid) is
  'Resolves a RECONCILIATION_REQUIRED prospective learning attempt only from canonical existing run/artifact/budget evidence. It never re-dispatches provider execution.';
