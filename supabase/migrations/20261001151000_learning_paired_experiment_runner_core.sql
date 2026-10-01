-- Durable case/arm identities for governed prospective learning experiments.
-- This migration does not dispatch providers. It creates a server-owned checkpoint
-- that must exist before any paid attempt, and fail-closes ambiguous resume paths.

create table if not exists agent.learning_experiment_attempts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  policy_id uuid not null,
  candidate_id uuid not null,
  dataset_manifest_id uuid not null,
  case_key text not null check (case_key ~ '^[a-f0-9]{64}$'),
  arm text not null check (arm in ('BASELINE','CANDIDATE')),
  version text not null check (length(btrim(version)) > 0),
  agent_definition_id uuid not null references agent.agent_definitions(id) on delete restrict,
  run_id uuid not null unique default gen_random_uuid(),
  execution_key text not null unique check (execution_key ~ '^sha256:[a-f0-9]{64}$'),
  input_evidence_ref text not null check (length(btrim(input_evidence_ref)) > 0),
  output_evidence_ref text,
  synthetic boolean not null default false,
  status text not null check (status in (
    'PREPARED','DISPATCHED','COMPLETED','FAILED','CANCELLED','RECONCILIATION_REQUIRED'
  )),
  reservation_id uuid references agent.learning_experiment_budget_reservations(id) on delete restrict,
  cost_event_id uuid references governance.ai_model_cost_events(id) on delete restrict,
  last_error_code text,
  created_at timestamptz not null default now(),
  dispatched_at timestamptz,
  completed_at timestamptz,
  constraint learning_experiment_attempt_policy_fk
    foreign key (policy_id, project_id)
    references agent.learning_evaluation_policies(id, project_id)
    on delete cascade,
  constraint learning_experiment_attempt_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint learning_experiment_attempt_manifest_fk
    foreign key (dataset_manifest_id, project_id)
    references agent.learning_benchmark_dataset_manifests(id, project_id)
    on delete restrict,
  constraint learning_experiment_attempt_case_fk
    foreign key (project_id, dataset_manifest_id, case_key)
    references agent.learning_benchmark_dataset_cases(project_id, dataset_id, case_key)
    on delete restrict,
  constraint learning_experiment_attempt_case_arm_uq
    unique (policy_id, case_key, arm),
  constraint learning_experiment_attempt_output_ck check (
    (status = 'COMPLETED' and output_evidence_ref is not null and length(btrim(output_evidence_ref)) > 0)
    or status <> 'COMPLETED'
  ),
  constraint learning_experiment_attempt_times_ck check (
    (status = 'PREPARED' and dispatched_at is null and completed_at is null)
    or (status = 'DISPATCHED' and dispatched_at is not null and completed_at is null)
    or (status in ('COMPLETED','FAILED','CANCELLED','RECONCILIATION_REQUIRED')
      and dispatched_at is not null and completed_at is not null)
  )
);

create index if not exists learning_experiment_attempts_policy_status_idx
  on agent.learning_experiment_attempts(project_id, policy_id, status, created_at);
create index if not exists learning_experiment_attempts_run_idx
  on agent.learning_experiment_attempts(project_id, run_id);
create index if not exists learning_experiment_attempts_definition_idx
  on agent.learning_experiment_attempts(agent_definition_id);

create table if not exists agent.learning_experiment_attempt_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  attempt_id uuid not null,
  event_sequence integer not null check (event_sequence > 0),
  from_status text,
  to_status text not null check (to_status in (
    'PREPARED','DISPATCHED','COMPLETED','FAILED','CANCELLED','RECONCILIATION_REQUIRED'
  )),
  reason text not null check (length(btrim(reason)) > 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint learning_experiment_attempt_event_attempt_fk
    foreign key (attempt_id)
    references agent.learning_experiment_attempts(id)
    on delete cascade,
  constraint learning_experiment_attempt_event_project_fk
    foreign key (project_id)
    references app.projects(id)
    on delete cascade,
  constraint learning_experiment_attempt_event_seq_uq unique (attempt_id, event_sequence)
);

create index if not exists learning_experiment_attempt_events_project_idx
  on agent.learning_experiment_attempt_events(project_id, attempt_id, event_sequence);

alter table agent.learning_experiment_attempts enable row level security;
alter table agent.learning_experiment_attempt_events enable row level security;

drop policy if exists learning_experiment_attempts_project_read on agent.learning_experiment_attempts;
create policy learning_experiment_attempts_project_read
  on agent.learning_experiment_attempts for select to authenticated
  using (app_private.is_project_member(project_id));

drop policy if exists learning_experiment_attempt_events_project_read on agent.learning_experiment_attempt_events;
create policy learning_experiment_attempt_events_project_read
  on agent.learning_experiment_attempt_events for select to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.learning_experiment_attempts from public, anon, authenticated, service_role;
revoke all on agent.learning_experiment_attempt_events from public, anon, authenticated, service_role;
grant select on agent.learning_experiment_attempts to authenticated, service_role;
grant select on agent.learning_experiment_attempt_events to authenticated, service_role;

create or replace function agent.reject_learning_experiment_attempt_event_mutation()
returns trigger language plpgsql
set search_path = pg_catalog, agent
as $$ begin raise exception 'Learning experiment attempt events are immutable'; end; $$;
revoke all on function agent.reject_learning_experiment_attempt_event_mutation() from public, anon, authenticated, service_role;

drop trigger if exists reject_learning_experiment_attempt_event_mutation on agent.learning_experiment_attempt_events;
create trigger reject_learning_experiment_attempt_event_mutation
before update or delete on agent.learning_experiment_attempt_events
for each row execute function agent.reject_learning_experiment_attempt_event_mutation();

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
  v_expected_version text;
  v_execution_key text;
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
    return jsonb_build_object(
      'attemptId',v_attempt.id,'runId',v_attempt.run_id,'executionKey',v_attempt.execution_key,
      'status',v_attempt.status,'reused',true
    );
  end if;

  insert into agent.learning_experiment_attempts(
    project_id,policy_id,candidate_id,dataset_manifest_id,case_key,arm,version,agent_definition_id,
    execution_key,input_evidence_ref,synthetic,status
  ) values (
    p_project_id,p_policy_id,p_candidate_id,p_dataset_manifest_id,p_case_key,p_arm,v_expected_version,
    p_agent_definition_id,v_execution_key,btrim(p_input_evidence_ref),coalesce(p_synthetic,false),'PREPARED'
  ) returning * into v_attempt;

  insert into agent.learning_experiment_attempt_events(
    project_id,attempt_id,event_sequence,from_status,to_status,reason,metadata
  ) values (
    p_project_id,v_attempt.id,1,null,'PREPARED','SERVER_PREPARED_CASE_ARM_IDENTITY',
    jsonb_build_object('caseKey',p_case_key,'arm',p_arm,'executionKey',v_execution_key,'synthetic',v_attempt.synthetic)
  );

  return jsonb_build_object(
    'attemptId',v_attempt.id,'runId',v_attempt.run_id,'executionKey',v_attempt.execution_key,
    'status',v_attempt.status,'reused',false
  );
end;
$$;

create or replace function agent.begin_learning_experiment_dispatch(
  p_project_id uuid,
  p_attempt_id uuid,
  p_execution_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
declare
  v_attempt agent.learning_experiment_attempts%rowtype;
  v_seq integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('learning-experiment-dispatch:' || p_attempt_id::text,0));
  select * into v_attempt from agent.learning_experiment_attempts
  where id = p_attempt_id and project_id = p_project_id for update;
  if not found then raise exception 'learning experiment attempt not found'; end if;
  if v_attempt.execution_key <> p_execution_key then raise exception 'learning experiment execution key mismatch'; end if;

  if v_attempt.status = 'PREPARED' then
    update agent.learning_experiment_attempts
      set status='DISPATCHED', dispatched_at=clock_timestamp()
      where id=v_attempt.id returning * into v_attempt;
    select coalesce(max(event_sequence),0)+1 into v_seq
      from agent.learning_experiment_attempt_events where attempt_id=v_attempt.id;
    insert into agent.learning_experiment_attempt_events(
      project_id,attempt_id,event_sequence,from_status,to_status,reason
    ) values (p_project_id,v_attempt.id,v_seq,'PREPARED','DISPATCHED','SERVER_COMMITTED_PRE_PROVIDER_DISPATCH');
    return jsonb_build_object('admitted',true,'reason','DISPATCH_COMMITTED','runId',v_attempt.run_id,'status',v_attempt.status);
  end if;

  if v_attempt.status = 'DISPATCHED' then
    return jsonb_build_object('admitted',false,'reason','AMBIGUOUS_PRIOR_DISPATCH_REQUIRES_RECONCILIATION','runId',v_attempt.run_id,'status',v_attempt.status);
  end if;
  return jsonb_build_object('admitted',false,'reason','ATTEMPT_ALREADY_TERMINAL','runId',v_attempt.run_id,'status',v_attempt.status);
end;
$$;

create or replace function agent.complete_learning_experiment_attempt(
  p_project_id uuid,
  p_attempt_id uuid,
  p_execution_key text,
  p_terminal_status text,
  p_output_evidence_ref text,
  p_reservation_id uuid default null,
  p_cost_event_id uuid default null,
  p_error_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, agent, governance
as $$
declare
  v_attempt agent.learning_experiment_attempts%rowtype;
  v_reservation agent.learning_experiment_budget_reservations%rowtype;
  v_settlement agent.learning_experiment_budget_settlements%rowtype;
  v_seq integer;
  v_final_status text;
begin
  if p_terminal_status not in ('COMPLETED','FAILED','CANCELLED','RECONCILIATION_REQUIRED') then
    raise exception 'unsupported terminal experiment status';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('learning-experiment-dispatch:' || p_attempt_id::text,0));
  select * into v_attempt from agent.learning_experiment_attempts
    where id=p_attempt_id and project_id=p_project_id for update;
  if not found then raise exception 'learning experiment attempt not found'; end if;
  if v_attempt.execution_key <> p_execution_key then raise exception 'learning experiment execution key mismatch'; end if;
  if v_attempt.status <> 'DISPATCHED' then
    if v_attempt.status = p_terminal_status then
      if v_attempt.output_evidence_ref is distinct from
          (case when length(btrim(coalesce(p_output_evidence_ref,''))) > 0 then btrim(p_output_evidence_ref) else null end)
        or v_attempt.reservation_id is distinct from p_reservation_id
        or v_attempt.cost_event_id is distinct from p_cost_event_id
        or v_attempt.last_error_code is distinct from nullif(btrim(coalesce(p_error_code,'')),'')
      then
        raise exception 'terminal learning experiment evidence conflicts with existing immutable completion';
      end if;
      return jsonb_build_object('status',v_attempt.status,'idempotent',true,'runId',v_attempt.run_id);
    end if;
    raise exception 'learning experiment attempt is not in DISPATCHED state';
  end if;

  v_final_status := p_terminal_status;
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

  if v_final_status='COMPLETED' and length(btrim(coalesce(p_output_evidence_ref,'')))=0 then
    raise exception 'completed learning experiment attempt requires output evidence';
  end if;

  update agent.learning_experiment_attempts set
    status=v_final_status,
    output_evidence_ref=case when length(btrim(coalesce(p_output_evidence_ref,'')))>0 then btrim(p_output_evidence_ref) else null end,
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
      'reservationId',p_reservation_id,'costEventId',p_cost_event_id,'errorCode',nullif(btrim(coalesce(p_error_code,'')),'')
    )
  );

  return jsonb_build_object('status',v_attempt.status,'idempotent',false,'runId',v_attempt.run_id);
end;
$$;

revoke all on function agent.prepare_learning_experiment_attempt(uuid,uuid,uuid,uuid,text,text,uuid,text,text,boolean)
  from public, anon, authenticated;
revoke all on function agent.begin_learning_experiment_dispatch(uuid,uuid,text)
  from public, anon, authenticated;
revoke all on function agent.complete_learning_experiment_attempt(uuid,uuid,text,text,text,uuid,uuid,text)
  from public, anon, authenticated;
grant execute on function agent.prepare_learning_experiment_attempt(uuid,uuid,uuid,uuid,text,text,uuid,text,text,boolean)
  to service_role;
grant execute on function agent.begin_learning_experiment_dispatch(uuid,uuid,text)
  to service_role;
grant execute on function agent.complete_learning_experiment_attempt(uuid,uuid,text,text,text,uuid,uuid,text)
  to service_role;

comment on table agent.learning_experiment_attempts is
  'Durable server-owned case/arm identities for prospective learning evaluation. A DISPATCHED attempt cannot be re-dispatched after ambiguous process failure.';
comment on table agent.learning_experiment_attempt_events is
  'Append-only experiment attempt transitions used to audit preparation, dispatch, completion and reconciliation-required states.';
