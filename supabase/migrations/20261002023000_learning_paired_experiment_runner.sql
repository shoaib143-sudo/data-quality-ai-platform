-- Durable paired learning experiment runner evidence.
-- Server-owned run/case/arm identities are persisted before dispatch.
-- Synthetic rehearsals are explicitly segregated and can never become live release evidence.

create table if not exists agent.learning_experiment_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  policy_id uuid not null,
  candidate_id uuid not null,
  dataset_manifest_id uuid not null,
  evidence_class text not null check (evidence_class in ('SYNTHETIC','PROSPECTIVE_LIVE')),
  agent_key text not null,
  skill_key text not null,
  mode text not null check (mode in ('GUIDED','GOVERNED_AUTO','FULL_AUTONOMOUS')),
  baseline_version text not null,
  candidate_version text not null,
  evaluator_actor_id text not null,
  proposer_actor_id text not null,
  manifest_hash text not null check (manifest_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  constraint learning_experiment_runs_policy_fk
    foreign key (policy_id, project_id)
    references agent.learning_evaluation_policies(id, project_id) on delete restrict,
  constraint learning_experiment_runs_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id) on delete restrict,
  constraint learning_experiment_runs_manifest_fk
    foreign key (dataset_manifest_id, project_id)
    references agent.learning_benchmark_dataset_manifests(id, project_id) on delete restrict,
  constraint learning_experiment_runs_id_project_uq unique (id, project_id)
);

create table if not exists agent.learning_experiment_run_cases (
  run_id uuid not null,
  project_id uuid not null,
  case_key text not null check (case_key ~ '^[a-f0-9]{64}$'),
  ordinal integer not null check (ordinal > 0),
  source_case_ref text not null check (length(btrim(source_case_ref)) > 0),
  created_at timestamptz not null default clock_timestamp(),
  primary key (run_id, case_key),
  unique (run_id, ordinal),
  constraint learning_experiment_run_cases_run_fk
    foreign key (run_id, project_id)
    references agent.learning_experiment_runs(id, project_id) on delete restrict
);

create table if not exists agent.learning_experiment_arm_attempts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  run_id uuid not null,
  case_key text not null,
  arm text not null check (arm in ('BASELINE','CANDIDATE')),
  version text not null check (length(btrim(version)) > 0),
  attempt_key text not null check (length(btrim(attempt_key)) > 0),
  attempt_number integer not null check (attempt_number > 0),
  execution_correlation_id uuid not null unique,
  input_artifact_ref text not null check (length(btrim(input_artifact_ref)) > 0),
  input_artifact_hash text not null check (input_artifact_hash ~ '^sha256:[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  unique (run_id, attempt_key),
  unique (run_id, case_key, arm, attempt_number),
  constraint learning_experiment_arm_attempts_case_fk
    foreign key (run_id, case_key)
    references agent.learning_experiment_run_cases(run_id, case_key) on delete restrict,
  constraint learning_experiment_arm_attempts_run_fk
    foreign key (run_id, project_id)
    references agent.learning_experiment_runs(id, project_id) on delete restrict,
  constraint learning_experiment_arm_attempts_id_project_uq unique (id, project_id)
);

create table if not exists agent.learning_experiment_arm_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  run_id uuid not null,
  attempt_id uuid not null unique,
  terminal_status text not null check (terminal_status in ('SUCCEEDED','FAILED','CANCELLED','POLICY_BLOCKED','UNKNOWN')),
  output_artifact_ref text,
  output_artifact_hash text,
  budget_reservation_id uuid,
  cost_event_id uuid,
  observed_tokens bigint,
  observed_cost numeric,
  observed_latency_ms integer,
  failure_code text,
  completed_at timestamptz not null default clock_timestamp(),
  constraint learning_experiment_arm_results_attempt_fk
    foreign key (attempt_id, project_id)
    references agent.learning_experiment_arm_attempts(id, project_id) on delete restrict,
  constraint learning_experiment_arm_results_run_fk
    foreign key (run_id, project_id)
    references agent.learning_experiment_runs(id, project_id) on delete restrict,
  constraint learning_experiment_arm_results_reservation_fk
    foreign key (budget_reservation_id, project_id)
    references agent.learning_experiment_budget_reservations(id, project_id) on delete restrict,
  constraint learning_experiment_arm_results_cost_fk
    foreign key (cost_event_id)
    references governance.ai_model_cost_events(id) on delete restrict,
  constraint learning_experiment_arm_results_shape_ck check (
    observed_tokens is null or observed_tokens >= 0
  ),
  constraint learning_experiment_arm_results_cost_ck check (
    observed_cost is null or (observed_cost >= 0 and observed_cost <> 'NaN'::numeric and observed_cost <> 'Infinity'::numeric)
  ),
  constraint learning_experiment_arm_results_latency_ck check (
    observed_latency_ms is null or observed_latency_ms >= 0
  )
);

create table if not exists agent.learning_experiment_case_scores (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  run_id uuid not null,
  case_key text not null,
  evaluator_actor_id text not null check (length(btrim(evaluator_actor_id)) > 0),
  evaluator_type text not null check (evaluator_type in ('DETERMINISTIC','LABELED_DATASET','ADVERSARIAL_SUITE','HUMAN_EVALUATION')),
  baseline_result_id uuid not null,
  candidate_result_id uuid not null,
  baseline_score numeric not null check (baseline_score >= 0 and baseline_score <= 1),
  candidate_score numeric not null check (candidate_score >= 0 and candidate_score <= 1),
  independently_verified boolean not null,
  authority_violation boolean not null default false,
  safety_failure boolean not null default false,
  rubric_ref text not null check (length(btrim(rubric_ref)) > 0),
  calibration_ref text not null check (length(btrim(calibration_ref)) > 0),
  observed_at timestamptz not null,
  created_at timestamptz not null default clock_timestamp(),
  unique (run_id, case_key),
  constraint learning_experiment_case_scores_case_fk
    foreign key (run_id, case_key)
    references agent.learning_experiment_run_cases(run_id, case_key) on delete restrict,
  constraint learning_experiment_case_scores_run_fk
    foreign key (run_id, project_id)
    references agent.learning_experiment_runs(id, project_id) on delete restrict,
  constraint learning_experiment_case_scores_baseline_fk
    foreign key (baseline_result_id, project_id)
    references agent.learning_experiment_arm_results(id, project_id) on delete restrict,
  constraint learning_experiment_case_scores_candidate_fk
    foreign key (candidate_result_id, project_id)
    references agent.learning_experiment_arm_results(id, project_id) on delete restrict
);

create index if not exists learning_experiment_run_cases_project_idx
  on agent.learning_experiment_run_cases(project_id, run_id, ordinal);
create index if not exists learning_experiment_arm_attempts_case_idx
  on agent.learning_experiment_arm_attempts(project_id, run_id, case_key, arm);
create index if not exists learning_experiment_arm_results_run_idx
  on agent.learning_experiment_arm_results(project_id, run_id, terminal_status);
create index if not exists learning_experiment_case_scores_run_idx
  on agent.learning_experiment_case_scores(project_id, run_id, case_key);

alter table agent.learning_experiment_runs enable row level security;
alter table agent.learning_experiment_run_cases enable row level security;
alter table agent.learning_experiment_arm_attempts enable row level security;
alter table agent.learning_experiment_arm_results enable row level security;
alter table agent.learning_experiment_case_scores enable row level security;

revoke all on agent.learning_experiment_runs, agent.learning_experiment_run_cases,
  agent.learning_experiment_arm_attempts, agent.learning_experiment_arm_results,
  agent.learning_experiment_case_scores
from public, anon, authenticated, service_role;
grant select, insert on agent.learning_experiment_runs, agent.learning_experiment_run_cases,
  agent.learning_experiment_arm_attempts, agent.learning_experiment_arm_results,
  agent.learning_experiment_case_scores
to service_role;

create trigger learning_experiment_runs_immutable
before update or delete on agent.learning_experiment_runs
for each row execute function agent.reject_learning_candidate_evidence_mutation();
create trigger learning_experiment_run_cases_immutable
before update or delete on agent.learning_experiment_run_cases
for each row execute function agent.reject_learning_candidate_evidence_mutation();
create trigger learning_experiment_arm_attempts_immutable
before update or delete on agent.learning_experiment_arm_attempts
for each row execute function agent.reject_learning_candidate_evidence_mutation();
create trigger learning_experiment_arm_results_immutable
before update or delete on agent.learning_experiment_arm_results
for each row execute function agent.reject_learning_candidate_evidence_mutation();
create trigger learning_experiment_case_scores_immutable
before update or delete on agent.learning_experiment_case_scores
for each row execute function agent.reject_learning_candidate_evidence_mutation();

create or replace function agent.create_learning_experiment_run(
  p_project_id uuid,
  p_policy_id uuid,
  p_candidate_id uuid,
  p_evidence_class text,
  p_case_keys text[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
declare
  v_policy agent.learning_evaluation_policies%rowtype;
  v_manifest agent.learning_benchmark_dataset_manifests%rowtype;
  v_run_id uuid;
  v_case_key text;
  v_ordinal integer := 0;
  v_case agent.learning_benchmark_dataset_cases%rowtype;
begin
  if p_evidence_class not in ('SYNTHETIC','PROSPECTIVE_LIVE') then
    raise exception 'unsupported experiment evidence class';
  end if;
  select * into v_policy
  from agent.learning_evaluation_policies
  where id=p_policy_id and project_id=p_project_id and candidate_id=p_candidate_id;
  if not found then raise exception 'locked evaluation policy not found'; end if;
  select * into v_manifest
  from agent.learning_benchmark_dataset_manifests
  where id=v_policy.dataset_manifest_id and project_id=p_project_id;
  if not found or v_manifest.manifest_hash <> v_policy.manifest_hash then
    raise exception 'sealed manifest binding is invalid';
  end if;
  if p_case_keys is null or cardinality(p_case_keys) <> v_policy.sample_size then
    raise exception 'experiment case set must equal locked sample size';
  end if;
  if (select count(distinct x) from unnest(p_case_keys) x) <> cardinality(p_case_keys) then
    raise exception 'experiment case keys must be unique';
  end if;

  insert into agent.learning_experiment_runs(
    project_id,policy_id,candidate_id,dataset_manifest_id,evidence_class,
    agent_key,skill_key,mode,baseline_version,candidate_version,
    evaluator_actor_id,proposer_actor_id,manifest_hash
  ) values (
    p_project_id,p_policy_id,p_candidate_id,v_policy.dataset_manifest_id,p_evidence_class,
    v_policy.agent_key,v_policy.skill_key,v_policy.mode,v_policy.baseline_version,v_policy.candidate_version,
    v_policy.evaluator_actor_id,v_policy.proposer_actor_id,v_policy.manifest_hash
  ) returning id into v_run_id;

  foreach v_case_key in array p_case_keys loop
    v_ordinal := v_ordinal + 1;
    select * into v_case
    from agent.learning_benchmark_dataset_cases
    where dataset_id=v_policy.dataset_manifest_id
      and project_id=p_project_id
      and case_key=v_case_key
      and split='HELD_OUT';
    if not found then raise exception 'experiment case is not in sealed HELD_OUT partition'; end if;
    insert into agent.learning_experiment_run_cases(run_id,project_id,case_key,ordinal,source_case_ref)
    values(v_run_id,p_project_id,v_case.case_key,v_ordinal,v_case.source_case_ref);
  end loop;
  return v_run_id;
end;
$$;

create or replace function agent.prepare_learning_experiment_arm_attempt(
  p_project_id uuid,
  p_run_id uuid,
  p_case_key text,
  p_arm text,
  p_version text,
  p_attempt_key text,
  p_input_artifact_ref text,
  p_input_artifact_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
declare
  v_run agent.learning_experiment_runs%rowtype;
  v_existing agent.learning_experiment_arm_attempts%rowtype;
  v_attempt_id uuid;
  v_correlation_id uuid;
  v_expected_version text;
  v_attempt_number integer;
begin
  select * into v_run from agent.learning_experiment_runs
  where id=p_run_id and project_id=p_project_id;
  if not found then raise exception 'learning experiment run not found'; end if;
  if p_arm not in ('BASELINE','CANDIDATE') then raise exception 'unsupported experiment arm'; end if;
  if not exists (
    select 1 from agent.learning_experiment_run_cases
    where run_id=p_run_id and project_id=p_project_id and case_key=p_case_key
  ) then raise exception 'case is not selected for experiment run'; end if;
  v_expected_version := case when p_arm='BASELINE' then v_run.baseline_version else v_run.candidate_version end;
  if btrim(coalesce(p_version,'')) <> v_expected_version then raise exception 'experiment arm version does not match locked run'; end if;
  if btrim(coalesce(p_attempt_key,''))='' then raise exception 'attempt key is required'; end if;
  if p_input_artifact_hash is null or p_input_artifact_hash !~ '^sha256:[a-f0-9]{64}$' then
    raise exception 'input artifact hash must be sha256';
  end if;
  if btrim(coalesce(p_input_artifact_ref,''))='' then raise exception 'input artifact reference is required'; end if;

  select * into v_existing from agent.learning_experiment_arm_attempts
  where run_id=p_run_id and attempt_key=btrim(p_attempt_key);
  if found then
    if v_existing.case_key<>p_case_key or v_existing.arm<>p_arm or v_existing.version<>v_expected_version
      or v_existing.input_artifact_ref<>btrim(p_input_artifact_ref)
      or v_existing.input_artifact_hash<>p_input_artifact_hash
    then raise exception 'attempt key reuse does not match immutable attempt identity'; end if;
    return jsonb_build_object(
      'attemptId',v_existing.id,
      'executionCorrelationId',v_existing.execution_correlation_id,
      'attemptNumber',v_existing.attempt_number,
      'reused',true
    );
  end if;

  if exists (
    select 1 from agent.learning_experiment_arm_attempts a
    left join agent.learning_experiment_arm_results r on r.attempt_id=a.id
    where a.run_id=p_run_id and a.case_key=p_case_key and a.arm=p_arm and r.id is null
  ) then raise exception 'ambiguous prior experiment attempt has no terminal evidence'; end if;

  select coalesce(max(attempt_number),0)+1 into v_attempt_number
  from agent.learning_experiment_arm_attempts
  where run_id=p_run_id and case_key=p_case_key and arm=p_arm;

  v_correlation_id := gen_random_uuid();
  insert into agent.learning_experiment_arm_attempts(
    project_id,run_id,case_key,arm,version,attempt_key,attempt_number,
    execution_correlation_id,input_artifact_ref,input_artifact_hash
  ) values (
    p_project_id,p_run_id,p_case_key,p_arm,v_expected_version,btrim(p_attempt_key),v_attempt_number,
    v_correlation_id,btrim(p_input_artifact_ref),p_input_artifact_hash
  ) returning id into v_attempt_id;

  return jsonb_build_object(
    'attemptId',v_attempt_id,
    'executionCorrelationId',v_correlation_id,
    'attemptNumber',v_attempt_number,
    'reused',false
  );
end;
$$;

create or replace function agent.record_learning_experiment_arm_result(
  p_project_id uuid,
  p_run_id uuid,
  p_attempt_id uuid,
  p_terminal_status text,
  p_output_artifact_ref text,
  p_output_artifact_hash text,
  p_observed_latency_ms integer,
  p_failure_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent, governance
as $$
declare
  v_run agent.learning_experiment_runs%rowtype;
  v_attempt agent.learning_experiment_arm_attempts%rowtype;
  v_reservation agent.learning_experiment_budget_reservations%rowtype;
  v_settlement agent.learning_experiment_budget_settlements%rowtype;
  v_existing agent.learning_experiment_arm_results%rowtype;
  v_id uuid;
begin
  if p_terminal_status not in ('SUCCEEDED','FAILED','CANCELLED','POLICY_BLOCKED','UNKNOWN') then
    raise exception 'unsupported experiment terminal status';
  end if;
  select * into v_run from agent.learning_experiment_runs
  where id=p_run_id and project_id=p_project_id;
  if not found then raise exception 'learning experiment run not found'; end if;
  select * into v_attempt from agent.learning_experiment_arm_attempts
  where id=p_attempt_id and run_id=p_run_id and project_id=p_project_id;
  if not found then raise exception 'learning experiment attempt not found'; end if;
  select * into v_existing from agent.learning_experiment_arm_results where attempt_id=p_attempt_id;
  if found then
    if v_existing.terminal_status<>p_terminal_status
      or v_existing.output_artifact_ref is distinct from nullif(btrim(coalesce(p_output_artifact_ref,'')),'')
      or v_existing.output_artifact_hash is distinct from p_output_artifact_hash
      or v_existing.observed_latency_ms is distinct from p_observed_latency_ms
      or v_existing.failure_code is distinct from nullif(btrim(coalesce(p_failure_code,'')),'')
    then raise exception 'attempt already has different terminal evidence'; end if;
    return v_existing.id;
  end if;

  if p_terminal_status='SUCCEEDED' then
    if btrim(coalesce(p_output_artifact_ref,''))='' or p_output_artifact_hash is null
      or p_output_artifact_hash !~ '^sha256:[a-f0-9]{64}$'
    then raise exception 'successful experiment arm requires output artifact evidence'; end if;
  end if;
  if p_observed_latency_ms is not null and p_observed_latency_ms < 0 then
    raise exception 'observed latency must be non-negative'; end if;

  if v_run.evidence_class='PROSPECTIVE_LIVE' then
    select * into v_reservation
    from agent.learning_experiment_budget_reservations
    where project_id=p_project_id and run_id=v_attempt.execution_correlation_id;
    if p_terminal_status='SUCCEEDED' then
      if not found then raise exception 'live successful arm requires canonical budget reservation'; end if;
      select * into v_settlement
      from agent.learning_experiment_budget_settlements
      where reservation_id=v_reservation.id;
      if not found or v_settlement.status<>'ACCOUNTED' or v_settlement.cost_event_id is null then
        raise exception 'live successful arm requires canonical accounted settlement'; end if;
    end if;
  else
    if exists (
      select 1 from agent.learning_experiment_budget_reservations
      where project_id=p_project_id and run_id=v_attempt.execution_correlation_id
    ) then raise exception 'synthetic experiment arm cannot bind paid runtime evidence'; end if;
  end if;

  insert into agent.learning_experiment_arm_results(
    project_id,run_id,attempt_id,terminal_status,output_artifact_ref,output_artifact_hash,
    budget_reservation_id,cost_event_id,observed_tokens,observed_cost,observed_latency_ms,failure_code
  ) values (
    p_project_id,p_run_id,p_attempt_id,p_terminal_status,
    nullif(btrim(coalesce(p_output_artifact_ref,'')),''),
    p_output_artifact_hash,
    case when v_run.evidence_class='PROSPECTIVE_LIVE' and v_reservation.id is not null then v_reservation.id end,
    case when v_run.evidence_class='PROSPECTIVE_LIVE' and v_settlement.cost_event_id is not null then v_settlement.cost_event_id end,
    case when v_run.evidence_class='PROSPECTIVE_LIVE' and v_settlement.id is not null then v_settlement.observed_tokens end,
    case when v_run.evidence_class='PROSPECTIVE_LIVE' and v_settlement.id is not null then v_settlement.observed_cost end,
    p_observed_latency_ms,
    nullif(btrim(coalesce(p_failure_code,'')),'')
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function agent.record_learning_experiment_case_score(
  p_project_id uuid,
  p_run_id uuid,
  p_case_key text,
  p_evaluator_actor_id text,
  p_evaluator_type text,
  p_baseline_result_id uuid,
  p_candidate_result_id uuid,
  p_baseline_score numeric,
  p_candidate_score numeric,
  p_independently_verified boolean,
  p_authority_violation boolean,
  p_safety_failure boolean,
  p_rubric_ref text,
  p_calibration_ref text,
  p_observed_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
declare
  v_run agent.learning_experiment_runs%rowtype;
  v_baseline agent.learning_experiment_arm_results%rowtype;
  v_candidate agent.learning_experiment_arm_results%rowtype;
  v_battempt agent.learning_experiment_arm_attempts%rowtype;
  v_cattempt agent.learning_experiment_arm_attempts%rowtype;
  v_id uuid;
begin
  select * into v_run from agent.learning_experiment_runs where id=p_run_id and project_id=p_project_id;
  if not found then raise exception 'learning experiment run not found'; end if;
  if btrim(coalesce(p_evaluator_actor_id,''))<>v_run.evaluator_actor_id then
    raise exception 'case evaluator does not match locked policy'; end if;
  if v_run.evaluator_actor_id=v_run.proposer_actor_id then raise exception 'evaluator independence is invalid'; end if;
  if p_evaluator_type not in ('DETERMINISTIC','LABELED_DATASET','ADVERSARIAL_SUITE','HUMAN_EVALUATION') then
    raise exception 'unsupported evaluator type'; end if;
  if p_baseline_score<0 or p_baseline_score>1 or p_candidate_score<0 or p_candidate_score>1 then
    raise exception 'case scores must be between zero and one'; end if;
  if btrim(coalesce(p_rubric_ref,''))='' or btrim(coalesce(p_calibration_ref,''))='' then
    raise exception 'rubric and calibration references are required'; end if;

  select * into v_baseline from agent.learning_experiment_arm_results
  where id=p_baseline_result_id and run_id=p_run_id and project_id=p_project_id and terminal_status='SUCCEEDED';
  if not found then raise exception 'baseline successful result not found'; end if;
  select * into v_candidate from agent.learning_experiment_arm_results
  where id=p_candidate_result_id and run_id=p_run_id and project_id=p_project_id and terminal_status='SUCCEEDED';
  if not found then raise exception 'candidate successful result not found'; end if;
  select * into v_battempt from agent.learning_experiment_arm_attempts where id=v_baseline.attempt_id;
  select * into v_cattempt from agent.learning_experiment_arm_attempts where id=v_candidate.attempt_id;
  if v_battempt.case_key<>p_case_key or v_cattempt.case_key<>p_case_key
    or v_battempt.arm<>'BASELINE' or v_cattempt.arm<>'CANDIDATE'
  then raise exception 'case score arm/result binding mismatch'; end if;

  insert into agent.learning_experiment_case_scores(
    project_id,run_id,case_key,evaluator_actor_id,evaluator_type,
    baseline_result_id,candidate_result_id,baseline_score,candidate_score,
    independently_verified,authority_violation,safety_failure,rubric_ref,calibration_ref,observed_at
  ) values (
    p_project_id,p_run_id,p_case_key,btrim(p_evaluator_actor_id),p_evaluator_type,
    p_baseline_result_id,p_candidate_result_id,p_baseline_score,p_candidate_score,
    p_independently_verified,coalesce(p_authority_violation,false),coalesce(p_safety_failure,false),
    btrim(p_rubric_ref),btrim(p_calibration_ref),p_observed_at
  ) returning id into v_id;
  return v_id;
end;
$$;

create or replace function agent.derive_learning_experiment_summary(
  p_project_id uuid,
  p_run_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, agent
as $$
declare
  v_run agent.learning_experiment_runs%rowtype;
  v_case_count integer;
  v_score_count integer;
  v_failed_arms integer;
  v_baseline numeric;
  v_candidate numeric;
  v_authority integer;
  v_safety integer;
  v_total_cost numeric;
  v_max_run_cost numeric;
  v_total_tokens bigint;
  v_max_run_tokens bigint;
  v_max_latency integer;
  v_accounted integer;
  v_live_success integer;
begin
  select * into v_run from agent.learning_experiment_runs where id=p_run_id and project_id=p_project_id;
  if not found then raise exception 'learning experiment run not found'; end if;
  select count(*) into v_case_count from agent.learning_experiment_run_cases where run_id=p_run_id;
  select count(*),avg(baseline_score),avg(candidate_score),
    count(*) filter(where authority_violation),
    count(*) filter(where safety_failure)
  into v_score_count,v_baseline,v_candidate,v_authority,v_safety
  from agent.learning_experiment_case_scores where run_id=p_run_id;

  select count(*) into v_failed_arms
  from agent.learning_experiment_arm_results r
  join agent.learning_experiment_arm_attempts a on a.id=r.attempt_id
  where r.run_id=p_run_id and r.terminal_status<>'SUCCEEDED';

  select coalesce(sum(r.observed_cost),0),coalesce(max(r.observed_cost),0),
    coalesce(sum(r.observed_tokens),0),coalesce(max(r.observed_tokens),0),
    coalesce(max(r.observed_latency_ms),0),
    count(*) filter(where r.budget_reservation_id is not null and r.cost_event_id is not null),
    count(*)
  into v_total_cost,v_max_run_cost,v_total_tokens,v_max_run_tokens,v_max_latency,v_accounted,v_live_success
  from agent.learning_experiment_arm_results r
  where r.run_id=p_run_id and r.terminal_status='SUCCEEDED';

  return jsonb_build_object(
    'runId',p_run_id,
    'evidenceClass',v_run.evidence_class,
    'caseCount',v_case_count,
    'scoredCaseCount',v_score_count,
    'complete',v_score_count=v_case_count and v_failed_arms=0,
    'baselineScore',v_baseline,
    'candidateScore',v_candidate,
    'authorityViolations',v_authority,
    'safetyFailures',v_safety,
    'accountingComplete',case when v_run.evidence_class='SYNTHETIC' then true else v_accounted=v_live_success end,
    'totalCost',v_total_cost,
    'maxRunCost',v_max_run_cost,
    'totalTokens',v_total_tokens,
    'maxRunTokens',v_max_run_tokens,
    'maxLatencyMs',v_max_latency
  );
end;
$$;

revoke all on function agent.create_learning_experiment_run(uuid,uuid,uuid,text,text[]) from public,anon,authenticated;
revoke all on function agent.prepare_learning_experiment_arm_attempt(uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function agent.record_learning_experiment_arm_result(uuid,uuid,uuid,text,text,text,integer,text) from public,anon,authenticated;
revoke all on function agent.record_learning_experiment_case_score(uuid,uuid,text,text,text,uuid,uuid,numeric,numeric,boolean,boolean,boolean,text,text,timestamptz) from public,anon,authenticated;
revoke all on function agent.derive_learning_experiment_summary(uuid,uuid) from public,anon,authenticated;
grant execute on function agent.create_learning_experiment_run(uuid,uuid,uuid,text,text[]) to service_role;
grant execute on function agent.prepare_learning_experiment_arm_attempt(uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function agent.record_learning_experiment_arm_result(uuid,uuid,uuid,text,text,text,integer,text) to service_role;
grant execute on function agent.record_learning_experiment_case_score(uuid,uuid,text,text,text,uuid,uuid,numeric,numeric,boolean,boolean,boolean,text,text,timestamptz) to service_role;
grant execute on function agent.derive_learning_experiment_summary(uuid,uuid) to service_role;

comment on table agent.learning_experiment_runs is 'Immutable root identity for a locked paired learning experiment. Synthetic and prospective-live evidence are explicitly segregated.';
comment on table agent.learning_experiment_arm_attempts is 'Pre-dispatch immutable arm attempts. Re-entry is idempotent by attempt_key and ambiguous unfinished attempts block redispatch.';
comment on table agent.learning_experiment_arm_results is 'Terminal arm evidence bound to canonical budget/accounting evidence for prospective-live runs.';
comment on table agent.learning_experiment_case_scores is 'Independent paired case scores bound to successful baseline/candidate arm result evidence.';
