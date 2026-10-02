\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
do $$
begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;

create schema if not exists app;
create schema if not exists app_private;
create schema if not exists agent;
create function app_private.is_project_member(uuid) returns boolean language sql stable as $$ select false $$;

create table app.projects(id uuid primary key);
create table agent.learning_candidates(
  id uuid primary key,
  project_id uuid not null references app.projects(id),
  unique(id,project_id)
);
create table agent.learning_benchmark_dataset_manifests(
  id uuid primary key,
  project_id uuid not null references app.projects(id),
  manifest_hash text not null,
  status text not null,
  held_out_case_count integer not null,
  unique(id,project_id)
);
create table agent.learning_benchmark_dataset_cases(
  dataset_id uuid not null,
  project_id uuid not null,
  case_key text not null,
  split text not null,
  source_case_ref text not null,
  primary key(dataset_id,case_key),
  foreign key(dataset_id,project_id) references agent.learning_benchmark_dataset_manifests(id,project_id)
);
create table agent.learning_evaluation_policies(
  id uuid primary key,
  project_id uuid not null references app.projects(id),
  candidate_id uuid not null,
  dataset_manifest_id uuid not null,
  baseline_version text not null,
  candidate_version text not null,
  evaluator_actor_id text not null,
  manifest_hash text not null,
  sample_size integer not null,
  created_at timestamptz not null default now(),
  unique(id,project_id),
  foreign key(candidate_id,project_id) references agent.learning_candidates(id,project_id),
  foreign key(dataset_manifest_id,project_id) references agent.learning_benchmark_dataset_manifests(id,project_id)
);

\ir ../supabase/migrations/20261002090000_learning_prospective_experiment_runner.sql

\set project_id '10000000-0000-4000-8000-000000000001'
\set candidate_id '20000000-0000-4000-8000-000000000001'
\set manifest_id '30000000-0000-4000-8000-000000000001'
\set policy_id '40000000-0000-4000-8000-000000000001'
\set baseline_evidence '50000000-0000-4000-8000-000000000001'
\set candidate_evidence '50000000-0000-4000-8000-000000000002'
\set case_key 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'

insert into app.projects(id) values(:'project_id');
insert into agent.learning_candidates(id,project_id) values(:'candidate_id',:'project_id');
insert into agent.learning_benchmark_dataset_manifests(id,project_id,manifest_hash,status,held_out_case_count)
values(:'manifest_id',:'project_id','sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','SEALED',1);
insert into agent.learning_benchmark_dataset_cases(dataset_id,project_id,case_key,split,source_case_ref)
values(:'manifest_id',:'project_id',:'case_key','HELD_OUT','case://held-out-1');
insert into agent.learning_evaluation_policies(
  id,project_id,candidate_id,dataset_manifest_id,baseline_version,candidate_version,
  evaluator_actor_id,manifest_hash,sample_size,created_at
) values(
  :'policy_id',:'project_id',:'candidate_id',:'manifest_id','baseline-v1','candidate-v2',
  'independent-evaluator','sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',1,now()
);

select (agent.begin_learning_prospective_experiment(
  :'project_id',:'policy_id',:'candidate_id','fixture-run','SYNTHETIC_REHEARSAL'
)->>'run_id') as experiment_run_id \gset

select (agent.claim_learning_prospective_attempt(
  :'project_id',:'experiment_run_id',:'case_key','BASELINE','baseline-v1',
  'sha256:1111111111111111111111111111111111111111111111111111111111111111'
)->>'attempt_id') as baseline_attempt_id \gset
select agent.complete_learning_prospective_attempt(
  :'project_id',:'baseline_attempt_id','SUCCEEDED',:'baseline_evidence',null
);

select (agent.claim_learning_prospective_attempt(
  :'project_id',:'experiment_run_id',:'case_key','CANDIDATE','candidate-v2',
  'sha256:2222222222222222222222222222222222222222222222222222222222222222'
)->>'attempt_id') as candidate_attempt_id \gset
select agent.complete_learning_prospective_attempt(
  :'project_id',:'candidate_attempt_id','SUCCEEDED',:'candidate_evidence',null
);

select agent.record_learning_prospective_case_evaluation(
  :'project_id',:'experiment_run_id',:'case_key','independent-evaluator',
  :'baseline_evidence',:'candidate_evidence',0.50,0.75,false,false,now()
);

select agent.complete_learning_prospective_experiment(:'project_id',:'experiment_run_id');
select agent.complete_learning_prospective_experiment(:'project_id',:'experiment_run_id');

do $$
declare result jsonb;
begin
  result := agent.begin_learning_prospective_experiment(
    '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001','fixture-run','SYNTHETIC_REHEARSAL'
  );
  if result->>'status' <> 'COMPLETED' or (result->>'existing')::boolean is not true then
    raise exception 'completed experiment did not resume idempotently';
  end if;
end $$;

-- Unresolved CLAIMED work must remain visible instead of being re-created.
select (agent.begin_learning_prospective_experiment(
  :'project_id',:'policy_id',:'candidate_id','recovery-run','SYNTHETIC_REHEARSAL'
)->>'run_id') as recovery_run_id \gset
select agent.claim_learning_prospective_attempt(
  :'project_id',:'recovery_run_id',:'case_key','BASELINE','baseline-v1',
  'sha256:3333333333333333333333333333333333333333333333333333333333333333'
);
do $$
declare result jsonb;
begin
  result := agent.claim_learning_prospective_attempt(
    '10000000-0000-4000-8000-000000000001',:'recovery_run_id'::uuid,
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    'BASELINE','baseline-v1',
    'sha256:3333333333333333333333333333333333333333333333333333333333333333'
  );
  if result->>'status' <> 'CLAIMED' or (result->>'existing')::boolean is not true then
    raise exception 'unresolved attempt was not returned as an existing durable claim';
  end if;
end $$;

-- A post-lock subset is rejected in v1.
insert into agent.learning_candidates(id,project_id)
values('20000000-0000-4000-8000-000000000002',:'project_id');
insert into agent.learning_benchmark_dataset_manifests(id,project_id,manifest_hash,status,held_out_case_count)
values('30000000-0000-4000-8000-000000000002',:'project_id',
'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','SEALED',2);
insert into agent.learning_benchmark_dataset_cases(dataset_id,project_id,case_key,split,source_case_ref) values
('30000000-0000-4000-8000-000000000002',:'project_id','cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc','HELD_OUT','case://c'),
('30000000-0000-4000-8000-000000000002',:'project_id','dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd','HELD_OUT','case://d');
insert into agent.learning_evaluation_policies(
  id,project_id,candidate_id,dataset_manifest_id,baseline_version,candidate_version,
  evaluator_actor_id,manifest_hash,sample_size,created_at
) values(
  '40000000-0000-4000-8000-000000000002',:'project_id','20000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000002','baseline-v1','candidate-v2','independent-evaluator',
  'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',1,now()
);
do $$
begin
  begin
    perform agent.begin_learning_prospective_experiment(
      '10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002','biased-subset','SYNTHETIC_REHEARSAL'
    );
    raise exception 'subset selection unexpectedly admitted';
  exception when others then
    if SQLERRM not like '%complete held-out partition%' then raise; end if;
  end;
end $$;

-- Wrong evaluator and mismatched evidence are rejected.
do $$
begin
  begin
    perform agent.record_learning_prospective_case_evaluation(
      '10000000-0000-4000-8000-000000000001',:'recovery_run_id'::uuid,
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','proposer',
      '50000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002',
      0.5,0.7,false,false,now()
    );
    raise exception 'wrong evaluator unexpectedly admitted';
  exception when others then
    if SQLERRM not like '%locked independent evaluator%' then raise; end if;
  end;
end $$;

\echo 'prospective learning experiment durable runner SQL fixture passed'
