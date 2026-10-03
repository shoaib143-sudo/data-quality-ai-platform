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

create table governance.ai_model_cost_events(id uuid primary key);

create table agent.agent_definitions(
  id uuid primary key,
  agent_key text not null,
  version text not null
);

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

select
  (agent.prepare_learning_experiment_attempt(
    :'project_id',:'policy_id',:'candidate_id',:'manifest_id',:'case1',
    'CANDIDATE',:'candidate_def','2','fixture:input:case1:candidate',true
  )->>'attemptId') as attempt_1,
  (agent.prepare_learning_experiment_attempt(
    :'project_id',:'policy_id',:'candidate_id',:'manifest_id',:'case1',
    'CANDIDATE',:'candidate_def','2','fixture:input:case1:candidate',true
  )->>'runId') as run_1
\gset

-- Idempotent prepare returns the same durable attempt and marks reuse.
do $$
declare v jsonb;
begin
  v := agent.prepare_learning_experiment_attempt(
    '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'CANDIDATE','50000000-0000-4000-8000-000000000002','2','fixture:input:case1:candidate',true
  );
  if (v->>'attemptId')::uuid <> (
      select id from agent.learning_experiment_attempts
      where policy_id='40000000-0000-4000-8000-000000000001'
        and case_key='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        and arm='CANDIDATE'
    ) or coalesce((v->>'reused')::boolean,false) is not true then
    raise exception 'prepare idempotency failed';
  end if;
end $$;

select agent.begin_learning_experiment_dispatch(:'project_id',:'attempt_1',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_1'::uuid));

-- A retry after DISPATCHED is blocked rather than issuing a second attempt.
do $$
declare v jsonb;
begin
  v := agent.begin_learning_experiment_dispatch(
    '10000000-0000-4000-8000-000000000001',
    (select id from agent.learning_experiment_attempts
      where policy_id='40000000-0000-4000-8000-000000000001'
        and case_key='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        and arm='CANDIDATE'),
    (select execution_key from agent.learning_experiment_attempts
      where policy_id='40000000-0000-4000-8000-000000000001'
        and case_key='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
        and arm='CANDIDATE')
  );
  if coalesce((v->>'admitted')::boolean,true) is not false
    or v->>'reason' <> 'AMBIGUOUS_PRIOR_DISPATCH_REQUIRES_RECONCILIATION'
  then raise exception 'ambiguous re-dispatch was not blocked'; end if;
end $$;

select agent.complete_learning_experiment_attempt(
  :'project_id',:'attempt_1',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_1'::uuid),
  'COMPLETED','fixture:output:case1:candidate',null,null,null
);

-- Exact terminal retries are idempotent; changed terminal evidence is rejected.
select agent.complete_learning_experiment_attempt(
  :'project_id',:'attempt_1',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_1'::uuid),
  'COMPLETED','fixture:output:case1:candidate',null,null,null
);
do $$
begin
  begin
    perform agent.complete_learning_experiment_attempt(
      '10000000-0000-4000-8000-000000000001',
      (select id from agent.learning_experiment_attempts
        where policy_id='40000000-0000-4000-8000-000000000001'
          and case_key='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
          and arm='CANDIDATE'),
      (select execution_key from agent.learning_experiment_attempts
        where policy_id='40000000-0000-4000-8000-000000000001'
          and case_key='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
          and arm='CANDIDATE'),
      'COMPLETED','fixture:output:DIFFERENT',null,null,null
    );
    raise exception 'conflicting terminal evidence unexpectedly succeeded';
  exception when others then
    if SQLERRM not like '%conflicts with existing immutable completion%' then raise; end if;
  end;
end $$;

-- Reusing the same case/arm with changed immutable context is rejected.
do $$
begin
  begin
    perform agent.prepare_learning_experiment_attempt(
      '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      'CANDIDATE','50000000-0000-4000-8000-000000000002','2','fixture:DIFFERENT',true
    );
    raise exception 'immutable context mismatch unexpectedly succeeded';
  exception when others then
    if SQLERRM not like '%different immutable context%' then raise; end if;
  end;
end $$;

-- Non-synthetic completion must bind the exact reservation, run and ACCOUNTED settlement.
select
  (agent.prepare_learning_experiment_attempt(
    :'project_id',:'policy_id',:'candidate_id',:'manifest_id',:'case2',
    'BASELINE',:'baseline_def','1','fixture:input:case2:baseline',false
  )->>'attemptId') as attempt_2
\gset
select agent.begin_learning_experiment_dispatch(:'project_id',:'attempt_2',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_2'::uuid));

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

select agent.complete_learning_experiment_attempt(
  :'project_id',:'attempt_2',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_2'::uuid),
  'COMPLETED','fixture:output:case2:baseline',:'reservation_id',:'cost_event_id',null
);

-- Wrong or absent accounting forces reconciliation-required rather than success.
insert into agent.learning_benchmark_dataset_cases values
  (:'manifest_id',:'project_id','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','HELD_OUT','fixture:case:3');
select
  (agent.prepare_learning_experiment_attempt(
    :'project_id',:'policy_id',:'candidate_id',:'manifest_id',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    'CANDIDATE',:'candidate_def','2','fixture:input:case3:candidate',false
  )->>'attemptId') as attempt_3
\gset
select agent.begin_learning_experiment_dispatch(:'project_id',:'attempt_3',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_3'::uuid));
select agent.complete_learning_experiment_attempt(
  :'project_id',:'attempt_3',
  (select execution_key from agent.learning_experiment_attempts where id=:'attempt_3'::uuid),
  'COMPLETED','fixture:output:case3:candidate',null,null,'fixture-accounting-missing'
);
do $$
begin
  if (select status from agent.learning_experiment_attempts
      where policy_id='40000000-0000-4000-8000-000000000001'
        and case_key='cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
        and arm='CANDIDATE') <> 'RECONCILIATION_REQUIRED' then
    raise exception 'missing accounting did not force reconciliation required';
  end if;
end $$;

-- Attempt events are immutable evidence.
do $$
begin
  begin
    update agent.learning_experiment_attempt_events set reason='tampered'
      where attempt_id=(
        select id from agent.learning_experiment_attempts
        where policy_id='40000000-0000-4000-8000-000000000001'
          and case_key='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
          and arm='CANDIDATE'
      );
    raise exception 'event mutation unexpectedly succeeded';
  exception when others then
    if SQLERRM not like '%immutable%' then raise; end if;
  end;
end $$;

\echo 'paired experiment runner SQL fixture passed'
