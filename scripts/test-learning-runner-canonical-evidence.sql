\set ON_ERROR_STOP on
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
create schema if not exists app;
create schema if not exists app_private;
create schema if not exists governance;
create schema if not exists agent;

do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;

create table app.projects(id uuid primary key);
create function app_private.is_project_member(uuid) returns boolean language sql stable as $$ select false $$;

create type agent.run_status as enum (
  'CREATED','QUEUED','RUNNING','WAITING','COMPLETED','PARTIAL','FAILED','CANCELLED','SUCCEEDED'
);

create table agent.agent_definitions(
  id uuid primary key,
  agent_key text not null,
  version text not null
);

create table agent.agent_runs(
  id uuid primary key default gen_random_uuid(),
  agent_definition_id uuid not null references agent.agent_definitions(id),
  project_id uuid not null references app.projects(id),
  dataset_id uuid,
  dataset_version_id uuid,
  parent_run_id uuid references agent.agent_runs(id),
  correlation_id uuid not null default gen_random_uuid(),
  status agent.run_status not null default 'CREATED',
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_code text,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  cancel_requested_at timestamptz,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text
);

create table agent.agent_artifacts(
  id uuid primary key default gen_random_uuid(),
  agent_run_id uuid not null references agent.agent_runs(id) on delete cascade,
  artifact_type text not null,
  artifact_version text not null default '1.0',
  name text,
  payload jsonb,
  storage_uri text,
  content_hash text,
  created_at timestamptz not null default now(),
  retention_until timestamptz not null default (now() + interval '7 years')
);

create table governance.ai_model_cost_events(id uuid primary key);

create table agent.learning_candidates(
  id uuid primary key,
  project_id uuid not null references app.projects(id),
  agent_key text not null,
  skill_key text not null,
  baseline_version text not null,
  candidate_version text not null,
  unique(id,project_id)
);
create table agent.learning_benchmark_dataset_manifests(
  id uuid primary key,
  project_id uuid not null references app.projects(id),
  unique(id,project_id)
);
create table agent.learning_benchmark_dataset_cases(
  dataset_id uuid not null,
  project_id uuid not null,
  case_key text not null,
  split text not null,
  source_case_ref text not null,
  primary key(dataset_id,case_key),
  unique(project_id,dataset_id,case_key),
  foreign key(dataset_id,project_id) references agent.learning_benchmark_dataset_manifests(id,project_id)
);
create table agent.learning_evaluation_policies(
  id uuid primary key,
  project_id uuid not null references app.projects(id),
  candidate_id uuid not null,
  dataset_manifest_id uuid not null,
  agent_key text not null,
  skill_key text not null,
  baseline_version text not null,
  candidate_version text not null,
  created_at timestamptz not null default now(),
  unique(id,project_id),
  foreign key(candidate_id,project_id) references agent.learning_candidates(id,project_id),
  foreign key(dataset_manifest_id,project_id) references agent.learning_benchmark_dataset_manifests(id,project_id)
);
create table agent.learning_experiment_budget_reservations(
  id uuid primary key,
  project_id uuid not null,
  policy_id uuid not null,
  candidate_id uuid not null,
  run_id uuid not null,
  agent_key text not null
);
create table agent.learning_experiment_budget_settlements(
  reservation_id uuid primary key,
  project_id uuid not null,
  status text not null,
  cost_event_id uuid
);

\ir ../supabase/migrations/20261001151000_learning_paired_experiment_runner_core.sql
\ir ../supabase/migrations/20260911170000_durable_agent_run_result_artifacts.sql
\ir ../supabase/migrations/20261001153500_learning_runner_canonical_agent_evidence.sql

\set project_id '10000000-0000-4000-8000-000000000001'
\set candidate_id '20000000-0000-4000-8000-000000000001'
\set manifest_id '30000000-0000-4000-8000-000000000001'
\set policy_id '40000000-0000-4000-8000-000000000001'
\set baseline_def '50000000-0000-4000-8000-000000000001'
\set candidate_def '50000000-0000-4000-8000-000000000002'
\set case1 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
\set case2 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'

insert into app.projects values (:'project_id');
insert into agent.learning_candidates values (:'candidate_id',:'project_id','profiling_agent','profile_evidence_analysis','1','2');
insert into agent.learning_benchmark_dataset_manifests values (:'manifest_id',:'project_id');
insert into agent.learning_benchmark_dataset_cases values
  (:'manifest_id',:'project_id',:'case1','HELD_OUT','fixture:case:1'),
  (:'manifest_id',:'project_id',:'case2','HELD_OUT','fixture:case:2');
insert into agent.agent_definitions values
  (:'baseline_def','profiling_agent','1'),
  (:'candidate_def','profiling_agent','2');
insert into agent.learning_evaluation_policies(
  id,project_id,candidate_id,dataset_manifest_id,agent_key,skill_key,baseline_version,candidate_version,created_at
) values (
  :'policy_id',:'project_id',:'candidate_id',:'manifest_id','profiling_agent','profile_evidence_analysis','1','2',now()
);

-- Preparation atomically creates the canonical QUEUED agent run using the same run_id.
select
  (agent.prepare_learning_experiment_attempt(
    :'project_id',:'policy_id',:'candidate_id',:'manifest_id',:'case1',
    'CANDIDATE',:'candidate_def','2','fixture:input:case1:candidate',true
  )->>'attemptId') as attempt_1
\gset

do $$
declare v_attempt agent.learning_experiment_attempts%rowtype;
declare v_run agent.agent_runs%rowtype;
begin
  select * into v_attempt from agent.learning_experiment_attempts
    where policy_id='40000000-0000-4000-8000-000000000001'
      and case_key='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      and arm='CANDIDATE';
  select * into v_run from agent.agent_runs where id=v_attempt.run_id;
  if not found or v_run.status <> 'QUEUED'
    or v_run.project_id <> v_attempt.project_id
    or v_run.agent_definition_id <> v_attempt.agent_definition_id
    or v_run.correlation_id <> v_attempt.run_id
  then raise exception 'canonical queued agent run binding was not created'; end if;
  if v_run.input->>'learning_case_key' <> v_attempt.case_key
    or v_run.input->>'learning_arm' <> v_attempt.arm
    or v_run.input->>'learning_input_evidence_ref' <> v_attempt.input_evidence_ref
  then raise exception 'canonical agent run input provenance is incomplete'; end if;
end $$;

select agent.begin_learning_experiment_dispatch(
  :'project_id',:'attempt_1',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_1'::uuid)
);

-- Simulate the existing governed executor starting the prepared run, then use the
-- real canonical artifact persistence RPC to publish content-addressed output.
update agent.agent_runs set status='RUNNING', started_at=now() where id=(
  select run_id from agent.learning_experiment_attempts where id=:'attempt_1'::uuid
);
select artifact_id as artifact_1, content_hash as artifact_hash_1
from agent.persist_agent_run_result(
  (select run_id from agent.learning_experiment_attempts where id=:'attempt_1'::uuid),
  '{"answer":"fixture candidate output","evidence":["fixture:e1"]}'::jsonb,
  'AGENT_RUN_RESULT','1.0','Learning experiment candidate result',now()
) \gset

select agent.complete_learning_experiment_attempt_v2(
  :'project_id',:'attempt_1',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_1'::uuid),
  'COMPLETED',:'artifact_1',null,null,null
);

do $$
declare v_attempt agent.learning_experiment_attempts%rowtype;
declare v_artifact agent.agent_artifacts%rowtype;
begin
  select * into v_attempt from agent.learning_experiment_attempts
    where policy_id='40000000-0000-4000-8000-000000000001'
      and case_key='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
      and arm='CANDIDATE';
  select * into v_artifact from agent.agent_artifacts where id=v_attempt.result_artifact_id;
  if v_attempt.status <> 'COMPLETED'
    or v_attempt.result_content_hash is distinct from v_artifact.content_hash
    or v_artifact.agent_run_id <> v_attempt.run_id
    or v_artifact.artifact_type <> 'AGENT_RUN_RESULT'
    or v_artifact.artifact_version <> '1.0'
  then raise exception 'canonical completion artifact binding is invalid'; end if;
end $$;

-- Exact v2 retry is idempotent; a different artifact cannot rewrite completion.
select agent.complete_learning_experiment_attempt_v2(
  :'project_id',:'attempt_1',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_1'::uuid),
  'COMPLETED',:'artifact_1',null,null,null
);

insert into agent.agent_runs(id,agent_definition_id,project_id,status,input)
values ('60000000-0000-4000-8000-000000000099',:'candidate_def',:'project_id','RUNNING','{}');
select artifact_id as foreign_artifact
from agent.persist_agent_run_result(
  '60000000-0000-4000-8000-000000000099',
  '{"answer":"foreign"}'::jsonb,
  'AGENT_RUN_RESULT','1.0','Foreign result',now()
) \gset

do $$
begin
  begin
    perform agent.complete_learning_experiment_attempt_v2(
      '10000000-0000-4000-8000-000000000001',
      (select id from agent.learning_experiment_attempts
        where policy_id='40000000-0000-4000-8000-000000000001'
          and case_key='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
          and arm='CANDIDATE'),
      (select execution_key from agent.learning_experiment_attempts
        where policy_id='40000000-0000-4000-8000-000000000001'
          and case_key='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
          and arm='CANDIDATE'),
      'COMPLETED',
      (select id from agent.agent_artifacts where agent_run_id='60000000-0000-4000-8000-000000000099'),
      null,null,null
    );
    raise exception 'foreign artifact unexpectedly rewrote terminal completion';
  exception when others then
    if SQLERRM not like '%missing or invalid%'
      and SQLERRM not like '%conflicts with existing immutable completion%'
    then raise; end if;
  end;
end $$;

-- Non-synthetic completion requires both canonical artifact and exact ACCOUNTED budget evidence.
select
  (agent.prepare_learning_experiment_attempt(
    :'project_id',:'policy_id',:'candidate_id',:'manifest_id',:'case2',
    'BASELINE',:'baseline_def','1','fixture:input:case2:baseline',false
  )->>'attemptId') as attempt_2
\gset
select agent.begin_learning_experiment_dispatch(
  :'project_id',:'attempt_2',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_2'::uuid)
);
update agent.agent_runs set status='RUNNING', started_at=now() where id=(
  select run_id from agent.learning_experiment_attempts where id=:'attempt_2'::uuid
);
select artifact_id as artifact_2
from agent.persist_agent_run_result(
  (select run_id from agent.learning_experiment_attempts where id=:'attempt_2'::uuid),
  '{"answer":"fixture baseline output","evidence":["fixture:e2"]}'::jsonb,
  'AGENT_RUN_RESULT','1.0','Learning experiment baseline result',now()
) \gset

\set reservation_id '60000000-0000-4000-8000-000000000001'
\set cost_event_id '70000000-0000-4000-8000-000000000001'
insert into governance.ai_model_cost_events values (:'cost_event_id');
insert into agent.learning_experiment_budget_reservations(
  id,project_id,policy_id,candidate_id,run_id,agent_key
) select
  :'reservation_id',project_id,policy_id,candidate_id,run_id,'profiling_agent'
from agent.learning_experiment_attempts where id=:'attempt_2'::uuid;
insert into agent.learning_experiment_budget_settlements values
  (:'reservation_id',:'project_id','ACCOUNTED',:'cost_event_id');

select agent.complete_learning_experiment_attempt_v2(
  :'project_id',:'attempt_2',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_2'::uuid),
  'COMPLETED',:'artifact_2',:'reservation_id',:'cost_event_id',null
);

do $
begin
  if (select status from agent.learning_experiment_attempts
      where policy_id='40000000-0000-4000-8000-000000000001'
        and case_key='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
        and arm='BASELINE') <> 'COMPLETED' then
    raise exception 'accounted non-synthetic attempt did not complete';
  end if;
end $;


-- Delayed accounting resolves the same already-executed run without any re-dispatch.
insert into agent.learning_benchmark_dataset_cases values
  (:'manifest_id',:'project_id','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','HELD_OUT','fixture:case:3');

select
  (agent.prepare_learning_experiment_attempt(
    :'project_id',:'policy_id',:'candidate_id',:'manifest_id',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'CANDIDATE',:'candidate_def','2','fixture:input:case3:candidate',false
  )->>'attemptId') as attempt_3
\gset

select agent.begin_learning_experiment_dispatch(
  :'project_id',:'attempt_3',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_3'::uuid)
);

update agent.agent_runs set status='RUNNING', started_at=now() where id=(
  select run_id from agent.learning_experiment_attempts where id=:'attempt_3'::uuid
);
select artifact_id as artifact_3
from agent.persist_agent_run_result(
  (select run_id from agent.learning_experiment_attempts where id=:'attempt_3'::uuid),
  '{"answer":"fixture candidate delayed-accounting output","evidence":["fixture:e3"]}'::jsonb,
  'AGENT_RUN_RESULT','1.0','Learning experiment delayed result',now()
) \gset

select agent.complete_learning_experiment_attempt_v2(
  :'project_id',:'attempt_3',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_3'::uuid),
  'COMPLETED',:'artifact_3',null,null,'ACCOUNTING_PENDING'
);

do $$
declare v_attempt_id uuid;
begin
  select id into v_attempt_id from agent.learning_experiment_attempts
    where policy_id='40000000-0000-4000-8000-000000000001'
      and case_key='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
      and arm='CANDIDATE';
  if (select status from agent.learning_experiment_attempts where id=v_attempt_id) <> 'RECONCILIATION_REQUIRED' then
    raise exception 'missing accounting did not enter reconciliation-required state';
  end if;
  if (select count(*) from agent.learning_experiment_attempt_events
      where attempt_id=v_attempt_id and to_status='DISPATCHED') <> 1 then
    raise exception 'delayed accounting path unexpectedly changed dispatch cardinality';
  end if;
end $$;

\set reservation_3 '60000000-0000-4000-8000-000000000003'
\set cost_event_3 '70000000-0000-4000-8000-000000000003'
insert into governance.ai_model_cost_events values (:'cost_event_3');
insert into agent.learning_experiment_budget_reservations(
  id,project_id,policy_id,candidate_id,run_id,agent_key
) select
  :'reservation_3',project_id,policy_id,candidate_id,run_id,'profiling_agent'
from agent.learning_experiment_attempts where id=:'attempt_3'::uuid;
insert into agent.learning_experiment_budget_settlements values
  (:'reservation_3',:'project_id','ACCOUNTED',:'cost_event_3');

select agent.reconcile_learning_experiment_attempt(
  :'project_id',:'attempt_3',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_3'::uuid),
  :'artifact_3',:'reservation_3',:'cost_event_3'
);

do $$
declare v_attempt_id uuid;
begin
  select id into v_attempt_id from agent.learning_experiment_attempts
    where policy_id='40000000-0000-4000-8000-000000000001'
      and case_key='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
      and arm='CANDIDATE';
  if (select status from agent.learning_experiment_attempts where id=v_attempt_id) <> 'COMPLETED' then
    raise exception 'delayed canonical accounting did not reconcile to completed';
  end if;
  if (select count(*) from agent.learning_experiment_attempt_events
      where attempt_id=v_attempt_id and from_status='RECONCILIATION_REQUIRED' and to_status='COMPLETED') <> 1 then
    raise exception 'reconciliation completion event is missing';
  end if;
  if (select count(*) from agent.learning_experiment_attempt_events
      where attempt_id=v_attempt_id and to_status='DISPATCHED') <> 1 then
    raise exception 'reconciliation unexpectedly caused provider redispatch evidence';
  end if;
end $$;

\echo 'learning runner canonical agent-run/artifact evidence fixture passed'
