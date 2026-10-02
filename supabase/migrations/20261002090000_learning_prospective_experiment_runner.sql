-- Durable prospective learning experiment orchestration.
-- This state machine binds a locked policy to every held-out case and arm.
-- It is intentionally separate from governed release/promotion and cannot grant
-- authority, create pricing, or invoke a provider by itself.

create table if not exists agent.learning_prospective_experiment_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  policy_id uuid not null,
  candidate_id uuid not null,
  dataset_manifest_id uuid not null,
  run_key text not null,
  evidence_class text not null check (evidence_class in ('SYNTHETIC_REHEARSAL','LIVE_PROSPECTIVE')),
  status text not null default 'PREPARED'
    check (status in ('PREPARED','RUNNING','COMPLETED','FAILED','CANCELLED')),
  expected_case_count integer not null check (expected_case_count > 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint learning_prospective_run_policy_fk
    foreign key (policy_id, project_id)
    references agent.learning_evaluation_policies(id, project_id)
    on delete restrict,
  constraint learning_prospective_run_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete restrict,
  constraint learning_prospective_run_manifest_fk
    foreign key (dataset_manifest_id, project_id)
    references agent.learning_benchmark_dataset_manifests(id, project_id)
    on delete restrict,
  constraint learning_prospective_run_key_ck check (length(btrim(run_key)) > 0),
  constraint learning_prospective_run_project_policy_key_uq unique (project_id, policy_id, run_key),
  constraint learning_prospective_run_id_project_uq unique (id, project_id)
);

create table if not exists agent.learning_prospective_experiment_attempts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  experiment_run_id uuid not null,
  policy_id uuid not null,
  candidate_id uuid not null,
  case_key text not null check (case_key ~ '^[a-f0-9]{64}$'),
  arm text not null check (arm in ('BASELINE','CANDIDATE')),
  version text not null check (length(btrim(version)) > 0),
  attempt_key text not null check (attempt_key ~ '^sha256:[a-f0-9]{64}$'),
  execution_run_id uuid not null default gen_random_uuid(),
  status text not null default 'CLAIMED'
    check (status in ('CLAIMED','SUCCEEDED','FAILED','CANCELLED')),
  evidence_ref uuid,
  error_code text,
  claimed_at timestamptz not null default clock_timestamp(),
  completed_at timestamptz,
  constraint learning_prospective_attempt_run_fk
    foreign key (experiment_run_id, project_id)
    references agent.learning_prospective_experiment_runs(id, project_id)
    on delete cascade,
  constraint learning_prospective_attempt_policy_fk
    foreign key (policy_id, project_id)
    references agent.learning_evaluation_policies(id, project_id)
    on delete restrict,
  constraint learning_prospective_attempt_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete restrict,
  constraint learning_prospective_attempt_case_arm_uq unique (experiment_run_id, case_key, arm),
  constraint learning_prospective_attempt_key_uq unique (project_id, attempt_key),
  constraint learning_prospective_attempt_success_ck check (
    (status = 'SUCCEEDED' and evidence_ref is not null and error_code is null and completed_at is not null)
    or (status in ('FAILED','CANCELLED') and evidence_ref is null and length(btrim(error_code)) > 0 and completed_at is not null)
    or (status = 'CLAIMED' and evidence_ref is null and error_code is null and completed_at is null)
  )
);

create table if not exists agent.learning_prospective_case_evaluations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  experiment_run_id uuid not null,
  policy_id uuid not null,
  candidate_id uuid not null,
  case_key text not null check (case_key ~ '^[a-f0-9]{64}$'),
  evaluator_actor_id text not null check (length(btrim(evaluator_actor_id)) > 0),
  baseline_evidence_ref uuid not null,
  candidate_evidence_ref uuid not null,
  baseline_score numeric not null check (baseline_score between 0 and 1),
  candidate_score numeric not null check (candidate_score between 0 and 1),
  authority_violation boolean not null,
  adversarial_failure boolean not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint learning_prospective_case_eval_run_fk
    foreign key (experiment_run_id, project_id)
    references agent.learning_prospective_experiment_runs(id, project_id)
    on delete cascade,
  constraint learning_prospective_case_eval_policy_fk
    foreign key (policy_id, project_id)
    references agent.learning_evaluation_policies(id, project_id)
    on delete restrict,
  constraint learning_prospective_case_eval_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete restrict,
  constraint learning_prospective_case_eval_refs_ck check (baseline_evidence_ref <> candidate_evidence_ref),
  constraint learning_prospective_case_eval_case_uq unique (experiment_run_id, case_key)
);

create index if not exists learning_prospective_runs_policy_idx
  on agent.learning_prospective_experiment_runs(project_id, policy_id, status, created_at desc);
create index if not exists learning_prospective_attempts_run_idx
  on agent.learning_prospective_experiment_attempts(project_id, experiment_run_id, case_key, arm);
create index if not exists learning_prospective_case_eval_run_idx
  on agent.learning_prospective_case_evaluations(project_id, experiment_run_id, case_key);

alter table agent.learning_prospective_experiment_runs enable row level security;
alter table agent.learning_prospective_experiment_attempts enable row level security;
alter table agent.learning_prospective_case_evaluations enable row level security;

revoke all on agent.learning_prospective_experiment_runs from public, anon, authenticated, service_role;
revoke all on agent.learning_prospective_experiment_attempts from public, anon, authenticated, service_role;
revoke all on agent.learning_prospective_case_evaluations from public, anon, authenticated, service_role;
grant select on agent.learning_prospective_experiment_runs to authenticated, service_role;
grant select on agent.learning_prospective_experiment_attempts to authenticated, service_role;
grant select on agent.learning_prospective_case_evaluations to authenticated, service_role;

create policy learning_prospective_runs_project_read
  on agent.learning_prospective_experiment_runs for select to authenticated
  using (app_private.is_project_member(project_id));
create policy learning_prospective_attempts_project_read
  on agent.learning_prospective_experiment_attempts for select to authenticated
  using (app_private.is_project_member(project_id));
create policy learning_prospective_case_eval_project_read
  on agent.learning_prospective_case_evaluations for select to authenticated
  using (app_private.is_project_member(project_id));

create or replace function agent.begin_learning_prospective_experiment(
  p_project_id uuid,
  p_policy_id uuid,
  p_candidate_id uuid,
  p_run_key text,
  p_evidence_class text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, agent
as $$
declare
  v_policy agent.learning_evaluation_policies%rowtype;
  v_manifest agent.learning_benchmark_dataset_manifests%rowtype;
  v_existing agent.learning_prospective_experiment_runs%rowtype;
  v_id uuid;
begin
  if p_project_id is null or p_policy_id is null or p_candidate_id is null
    or length(btrim(coalesce(p_run_key,''))) = 0
    or p_evidence_class not in ('SYNTHETIC_REHEARSAL','LIVE_PROSPECTIVE')
  then raise exception 'valid experiment identity is required'; end if;

  select * into v_policy
  from agent.learning_evaluation_policies
  where id = p_policy_id and project_id = p_project_id and candidate_id = p_candidate_id;
  if not found then raise exception 'locked learning evaluation policy not found'; end if;

  if exists (
    select 1 from agent.learning_evaluation_policies newer
    where newer.project_id = p_project_id
      and newer.candidate_id = p_candidate_id
      and newer.id <> p_policy_id
      and newer.created_at >= v_policy.created_at
  ) then raise exception 'learning evaluation policy is not the latest unambiguous policy'; end if;

  select * into v_manifest
  from agent.learning_benchmark_dataset_manifests
  where id = v_policy.dataset_manifest_id and project_id = p_project_id and status = 'SEALED';
  if not found or v_manifest.manifest_hash <> v_policy.manifest_hash then
    raise exception 'sealed manifest binding is invalid';
  end if;

  -- v1 deliberately evaluates the complete HELD_OUT partition. Selecting a
  -- post-lock subset would create a sampling-bias channel until explicit
  -- immutable policy-case bindings exist.
  if v_policy.sample_size <> v_manifest.held_out_case_count then
    raise exception 'prospective runner requires sample_size to equal the complete held-out partition';
  end if;

  select * into v_existing
  from agent.learning_prospective_experiment_runs
  where project_id = p_project_id and policy_id = p_policy_id and run_key = btrim(p_run_key);
  if found then
    if v_existing.candidate_id <> p_candidate_id
      or v_existing.dataset_manifest_id <> v_policy.dataset_manifest_id
      or v_existing.evidence_class <> p_evidence_class
      or v_existing.expected_case_count <> v_policy.sample_size
    then raise exception 'experiment run key reuse conflicts with immutable context'; end if;
    return jsonb_build_object(
      'run_id',v_existing.id,'status',v_existing.status,
      'expected_case_count',v_existing.expected_case_count,'existing',true
    );
  end if;

  insert into agent.learning_prospective_experiment_runs(
    project_id,policy_id,candidate_id,dataset_manifest_id,run_key,evidence_class,
    status,expected_case_count,started_at
  ) values (
    p_project_id,p_policy_id,p_candidate_id,v_policy.dataset_manifest_id,btrim(p_run_key),p_evidence_class,
    'RUNNING',v_policy.sample_size,clock_timestamp()
  ) returning id into v_id;

  return jsonb_build_object('run_id',v_id,'status','RUNNING','expected_case_count',v_policy.sample_size,'existing',false);
end $$;

create or replace function agent.claim_learning_prospective_attempt(
  p_project_id uuid,
  p_experiment_run_id uuid,
  p_case_key text,
  p_arm text,
  p_version text,
  p_attempt_key text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, agent
as $$
declare
  v_run agent.learning_prospective_experiment_runs%rowtype;
  v_policy agent.learning_evaluation_policies%rowtype;
  v_attempt agent.learning_prospective_experiment_attempts%rowtype;
  v_expected_version text;
begin
  select * into v_run from agent.learning_prospective_experiment_runs
  where id = p_experiment_run_id and project_id = p_project_id for update;
  if not found or v_run.status <> 'RUNNING' then raise exception 'experiment run is not active'; end if;
  if p_arm not in ('BASELINE','CANDIDATE') then raise exception 'invalid experiment arm'; end if;
  if p_case_key is null or p_case_key !~ '^[a-f0-9]{64}$'
    or p_attempt_key is null or p_attempt_key !~ '^sha256:[a-f0-9]{64}$'
    or length(btrim(coalesce(p_version,''))) = 0
  then raise exception 'invalid attempt identity'; end if;

  select * into v_policy from agent.learning_evaluation_policies
  where id = v_run.policy_id and project_id = p_project_id;
  v_expected_version := case when p_arm='BASELINE' then v_policy.baseline_version else v_policy.candidate_version end;
  if btrim(p_version) <> v_expected_version then raise exception 'experiment arm version does not match locked policy'; end if;

  if not exists (
    select 1 from agent.learning_benchmark_dataset_cases c
    where c.project_id=p_project_id and c.dataset_id=v_run.dataset_manifest_id
      and c.case_key=p_case_key and c.split='HELD_OUT'
  ) then raise exception 'experiment case is not in the locked held-out partition'; end if;

  select * into v_attempt from agent.learning_prospective_experiment_attempts
  where experiment_run_id=p_experiment_run_id and case_key=p_case_key and arm=p_arm;
  if found then
    if v_attempt.attempt_key <> p_attempt_key or v_attempt.version <> btrim(p_version)
    then raise exception 'attempt identity conflicts with immutable case arm'; end if;
    return jsonb_build_object(
      'attempt_id',v_attempt.id,'execution_run_id',v_attempt.execution_run_id,
      'status',v_attempt.status,'evidence_ref',v_attempt.evidence_ref,'existing',true
    );
  end if;

  insert into agent.learning_prospective_experiment_attempts(
    project_id,experiment_run_id,policy_id,candidate_id,case_key,arm,version,attempt_key
  ) values (
    p_project_id,p_experiment_run_id,v_run.policy_id,v_run.candidate_id,p_case_key,p_arm,btrim(p_version),p_attempt_key
  ) returning * into v_attempt;

  return jsonb_build_object(
    'attempt_id',v_attempt.id,'execution_run_id',v_attempt.execution_run_id,
    'status',v_attempt.status,'evidence_ref',null,'existing',false
  );
end $$;

create or replace function agent.complete_learning_prospective_attempt(
  p_project_id uuid,
  p_attempt_id uuid,
  p_status text,
  p_evidence_ref uuid,
  p_error_code text
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, agent
as $$
declare v_attempt agent.learning_prospective_experiment_attempts%rowtype;
begin
  select * into v_attempt from agent.learning_prospective_experiment_attempts
  where id=p_attempt_id and project_id=p_project_id for update;
  if not found then raise exception 'experiment attempt not found'; end if;

  if v_attempt.status <> 'CLAIMED' then
    if v_attempt.status=p_status
      and v_attempt.evidence_ref is not distinct from p_evidence_ref
      and v_attempt.error_code is not distinct from nullif(btrim(coalesce(p_error_code,'')),'')
    then
      return jsonb_build_object('attempt_id',v_attempt.id,'status',v_attempt.status,'idempotent',true);
    end if;
    raise exception 'experiment attempt is already terminal';
  end if;

  if p_status='SUCCEEDED' then
    if p_evidence_ref is null or nullif(btrim(coalesce(p_error_code,'')),'') is not null
    then raise exception 'successful attempt requires evidence and no error'; end if;
  elsif p_status in ('FAILED','CANCELLED') then
    if p_evidence_ref is not null or nullif(btrim(coalesce(p_error_code,'')),'') is null
    then raise exception 'failed or cancelled attempt requires an error and no success evidence'; end if;
  else raise exception 'invalid terminal attempt status'; end if;

  update agent.learning_prospective_experiment_attempts
  set status=p_status,evidence_ref=p_evidence_ref,error_code=nullif(btrim(coalesce(p_error_code,'')),''),
      completed_at=clock_timestamp()
  where id=v_attempt.id;

  return jsonb_build_object('attempt_id',v_attempt.id,'status',p_status,'idempotent',false);
end $$;

create or replace function agent.record_learning_prospective_case_evaluation(
  p_project_id uuid,
  p_experiment_run_id uuid,
  p_case_key text,
  p_evaluator_actor_id text,
  p_baseline_evidence_ref uuid,
  p_candidate_evidence_ref uuid,
  p_baseline_score numeric,
  p_candidate_score numeric,
  p_authority_violation boolean,
  p_adversarial_failure boolean,
  p_observed_at timestamptz
) returns uuid
language plpgsql security definer
set search_path = pg_catalog, agent
as $$
declare
  v_run agent.learning_prospective_experiment_runs%rowtype;
  v_policy agent.learning_evaluation_policies%rowtype;
  v_existing agent.learning_prospective_case_evaluations%rowtype;
  v_id uuid;
begin
  select * into v_run from agent.learning_prospective_experiment_runs
  where id=p_experiment_run_id and project_id=p_project_id;
  if not found or v_run.status <> 'RUNNING' then raise exception 'experiment run is not active'; end if;
  select * into v_policy from agent.learning_evaluation_policies where id=v_run.policy_id and project_id=p_project_id;
  if btrim(coalesce(p_evaluator_actor_id,'')) <> v_policy.evaluator_actor_id then
    raise exception 'case evaluator does not match locked independent evaluator';
  end if;
  if p_observed_at is null or p_observed_at < v_policy.locked_at then
    raise exception 'case evaluation predates locked policy';
  end if;
  if p_baseline_score < 0 or p_baseline_score > 1 or p_candidate_score < 0 or p_candidate_score > 1 then
    raise exception 'case scores must be bounded';
  end if;

  if not exists (
    select 1 from agent.learning_prospective_experiment_attempts
    where experiment_run_id=p_experiment_run_id and case_key=p_case_key
      and arm='BASELINE' and status='SUCCEEDED' and evidence_ref=p_baseline_evidence_ref
  ) or not exists (
    select 1 from agent.learning_prospective_experiment_attempts
    where experiment_run_id=p_experiment_run_id and case_key=p_case_key
      and arm='CANDIDATE' and status='SUCCEEDED' and evidence_ref=p_candidate_evidence_ref
  ) then raise exception 'case evaluation evidence does not match successful paired attempts'; end if;

  select * into v_existing from agent.learning_prospective_case_evaluations
  where experiment_run_id=p_experiment_run_id and case_key=p_case_key;
  if found then
    if v_existing.evaluator_actor_id <> btrim(p_evaluator_actor_id)
      or v_existing.baseline_evidence_ref <> p_baseline_evidence_ref
      or v_existing.candidate_evidence_ref <> p_candidate_evidence_ref
      or v_existing.baseline_score <> p_baseline_score
      or v_existing.candidate_score <> p_candidate_score
      or v_existing.authority_violation <> p_authority_violation
      or v_existing.adversarial_failure <> p_adversarial_failure
    then raise exception 'case evaluation replay conflicts with immutable evidence'; end if;
    return v_existing.id;
  end if;

  insert into agent.learning_prospective_case_evaluations(
    project_id,experiment_run_id,policy_id,candidate_id,case_key,evaluator_actor_id,
    baseline_evidence_ref,candidate_evidence_ref,baseline_score,candidate_score,
    authority_violation,adversarial_failure,observed_at
  ) values (
    p_project_id,p_experiment_run_id,v_run.policy_id,v_run.candidate_id,p_case_key,btrim(p_evaluator_actor_id),
    p_baseline_evidence_ref,p_candidate_evidence_ref,p_baseline_score,p_candidate_score,
    p_authority_violation,p_adversarial_failure,p_observed_at
  ) returning id into v_id;
  return v_id;
end $$;

create or replace function agent.complete_learning_prospective_experiment(
  p_project_id uuid,
  p_experiment_run_id uuid
) returns jsonb
language plpgsql security definer
set search_path = pg_catalog, agent
as $$
declare
  v_run agent.learning_prospective_experiment_runs%rowtype;
  v_count integer;
begin
  select * into v_run from agent.learning_prospective_experiment_runs
  where id=p_experiment_run_id and project_id=p_project_id for update;
  if not found then raise exception 'experiment run not found'; end if;
  if v_run.status='COMPLETED' then
    return jsonb_build_object('run_id',v_run.id,'status',v_run.status,'idempotent',true);
  end if;
  if v_run.status <> 'RUNNING' then raise exception 'experiment run is not completable'; end if;

  select count(*) into v_count from agent.learning_prospective_case_evaluations
  where experiment_run_id=p_experiment_run_id and project_id=p_project_id;
  if v_count <> v_run.expected_case_count then raise exception 'experiment case evaluation set is incomplete'; end if;

  if exists (
    select 1 from agent.learning_prospective_experiment_attempts
    where experiment_run_id=p_experiment_run_id and status <> 'SUCCEEDED'
  ) then raise exception 'experiment contains non-successful attempts'; end if;

  update agent.learning_prospective_experiment_runs
  set status='COMPLETED',completed_at=clock_timestamp()
  where id=v_run.id;
  return jsonb_build_object('run_id',v_run.id,'status','COMPLETED','idempotent',false);
end $$;

revoke all on function agent.begin_learning_prospective_experiment(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function agent.claim_learning_prospective_attempt(uuid,uuid,text,text,text,text) from public,anon,authenticated;
revoke all on function agent.complete_learning_prospective_attempt(uuid,uuid,text,uuid,text) from public,anon,authenticated;
revoke all on function agent.record_learning_prospective_case_evaluation(uuid,uuid,text,text,uuid,uuid,numeric,numeric,boolean,boolean,timestamptz) from public,anon,authenticated;
revoke all on function agent.complete_learning_prospective_experiment(uuid,uuid) from public,anon,authenticated;
grant execute on function agent.begin_learning_prospective_experiment(uuid,uuid,uuid,text,text) to service_role;
grant execute on function agent.claim_learning_prospective_attempt(uuid,uuid,text,text,text,text) to service_role;
grant execute on function agent.complete_learning_prospective_attempt(uuid,uuid,text,uuid,text) to service_role;
grant execute on function agent.record_learning_prospective_case_evaluation(uuid,uuid,text,text,uuid,uuid,numeric,numeric,boolean,boolean,timestamptz) to service_role;
grant execute on function agent.complete_learning_prospective_experiment(uuid,uuid) to service_role;

comment on table agent.learning_prospective_experiment_runs is
  'Durable prospective learning experiment orchestration. SYNTHETIC_REHEARSAL can validate orchestration but never proves live improvement.';
comment on table agent.learning_prospective_experiment_attempts is
  'One durable claim per held-out case arm. Existing unresolved CLAIMED attempts must be reconciled; they are never blindly re-dispatched.';
comment on table agent.learning_prospective_case_evaluations is
  'Immutable paired independent case evaluation evidence for a prospective experiment run.';
