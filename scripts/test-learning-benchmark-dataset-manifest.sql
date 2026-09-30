-- Isolated PostgreSQL fixture for the real held-out dataset and paired-binding
-- migrations. This deliberately uses only synthetic fixture identities and
-- never inserts production or application data.
\set ON_ERROR_STOP on
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
set search_path = pg_catalog, public, extensions;
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists app;
create schema if not exists app_private;
create schema if not exists agent;
create schema if not exists governance;

create table app.projects (id uuid primary key);
create function app_private.is_project_member(uuid) returns boolean
language sql stable as $$ select false $$;

create table agent.learning_candidates (
  id uuid primary key,
  project_id uuid not null,
  agent_key text not null,
  skill_key text not null,
  evidence_cutoff_at timestamptz not null
);
create table governance.ai_evaluation_results (
  id uuid primary key,
  project_id uuid not null,
  evaluation_type text not null,
  capability text,
  score numeric,
  evidence_refs jsonb not null,
  metadata jsonb not null,
  evaluator_type text not null,
  observed_at timestamptz not null,
  created_at timestamptz not null
);
create table agent.learning_candidate_evidence (
  project_id uuid not null,
  candidate_id uuid not null,
  source_record_id text not null
);
create table agent.learning_candidate_benchmarks (
  id uuid primary key,
  project_id uuid not null,
  candidate_id uuid not null,
  benchmark_key text not null,
  evaluator_id text not null,
  evaluator_type text not null,
  observed_at timestamptz not null,
  baseline_version text not null,
  candidate_version text not null,
  case_count integer not null,
  baseline_score numeric not null,
  candidate_score numeric not null,
  authority_violations integer not null,
  adversarial_failures integer not null,
  evidence_refs text[] not null
);
create function agent.reject_learning_candidate_evidence_mutation()
returns trigger language plpgsql as $$ begin raise exception 'fixture evidence is append-only'; end; $$;

\ir ../supabase/migrations/20260929000100_learning_benchmark_case_bindings.sql
\ir ../supabase/migrations/20260929000300_learning_benchmark_dataset_manifest.sql

\set project_id '10000000-0000-4000-8000-000000000001'
\set candidate_id '20000000-0000-4000-8000-000000000001'
\set baseline_version 'baseline-fixture-v1'
\set candidate_version 'candidate-fixture-v2'
insert into app.projects(id) values (:'project_id'::uuid);
insert into agent.learning_candidates(id, project_id, agent_key, skill_key, evidence_cutoff_at)
values (:'candidate_id'::uuid, :'project_id'::uuid, 'profiling_agent', 'profile_evidence_analysis', now() - interval '2 hours');

select encode(extensions.digest('manifest-case-training','sha256'),'hex') as training_case_key,
       encode(extensions.digest('manifest-case-held-out','sha256'),'hex') as held_out_case_key
\gset
select 'sha256:' || encode(extensions.digest(
  (select string_agg(case_key || ':' || split || ':' || source_ref, '|' order by case_key)
   from (values
     (:'training_case_key', 'TRAINING', 'fixture-training-source'),
     (:'held_out_case_key', 'HELD_OUT', 'fixture-held-out-source')
   ) as cases(case_key, split, source_ref)), 'sha256'), 'hex') as manifest_hash
\gset
select agent.register_learning_benchmark_dataset(
  :'project_id'::uuid,
  'fixture-dataset-v1',
  'fixture-snapshot-1',
  'fixture-source-snapshot',
  'fixture-seed-1',
  :'manifest_hash',
  now() - interval '2 hours',
  jsonb_build_array(
    jsonb_build_object('case_key', :'training_case_key', 'split', 'TRAINING', 'source_case_ref', 'fixture-training-source'),
    jsonb_build_object('case_key', :'held_out_case_key', 'split', 'HELD_OUT', 'source_case_ref', 'fixture-held-out-source')
  )) as dataset_id
\gset

-- Persist baseline and candidate evaluations independently, then bind them
-- through the actual benchmark trigger.
insert into governance.ai_evaluation_results(
  id, project_id, evaluation_type, capability, score, evidence_refs, metadata,
  evaluator_type, observed_at, created_at
) values (
  gen_random_uuid(), :'project_id'::uuid, 'AGENT_SKILL',
  'agent_skill:profiling_agent:profile_evidence_analysis', 0.70,
  jsonb_build_array('fixture-evidence-baseline'),
  jsonb_build_object('benchmark_case_key', :'held_out_case_key', 'benchmark_variant', 'BASELINE', 'benchmark_split', 'HELD_OUT', 'learning_candidate_id', :'candidate_id', 'agent_key', 'profiling_agent', 'skill_key', 'profile_evidence_analysis', 'version', :'baseline_version', 'benchmark_evaluator_id', 'fixture-evaluator', 'benchmark_key', 'fixture-benchmark-ok', 'benchmark_dataset_key', 'fixture-dataset-v1', 'synthetic', 'false', 'authority_violation', 'false', 'adversarial_failure', 'false'),
  'DETERMINISTIC', now() - interval '30 minutes', now() - interval '30 minutes'
) returning id as baseline_eval_id
\gset
insert into governance.ai_evaluation_results(
  id, project_id, evaluation_type, capability, score, evidence_refs, metadata,
  evaluator_type, observed_at, created_at
) values (
  gen_random_uuid(), :'project_id'::uuid, 'AGENT_SKILL',
  'agent_skill:profiling_agent:profile_evidence_analysis', 0.80,
  jsonb_build_array('fixture-evidence-candidate'),
  jsonb_build_object('benchmark_case_key', :'held_out_case_key', 'benchmark_variant', 'CANDIDATE', 'benchmark_split', 'HELD_OUT', 'learning_candidate_id', :'candidate_id', 'agent_key', 'profiling_agent', 'skill_key', 'profile_evidence_analysis', 'version', :'candidate_version', 'benchmark_evaluator_id', 'fixture-evaluator', 'benchmark_key', 'fixture-benchmark-ok', 'benchmark_dataset_key', 'fixture-dataset-v1', 'synthetic', 'false', 'authority_violation', 'false', 'adversarial_failure', 'false'),
  'DETERMINISTIC', now() - interval '30 minutes', now() - interval '30 minutes'
) returning id as candidate_eval_id
\gset

insert into agent.learning_candidate_benchmarks(
  id, project_id, candidate_id, benchmark_key, evaluator_id, evaluator_type,
  observed_at, baseline_version, candidate_version, case_count, baseline_score,
  candidate_score, authority_violations, adversarial_failures, evidence_refs
) values (
  gen_random_uuid(), :'project_id'::uuid, :'candidate_id'::uuid, 'fixture-benchmark-ok',
  'fixture-evaluator', 'DETERMINISTIC', now(), :'baseline_version', :'candidate_version',
  1, 0.70, 0.80, 0, 0, array[:'baseline_eval_id', :'candidate_eval_id']
);
do $$ begin
  if (select count(*) from agent.learning_benchmark_case_bindings) <> 2 then raise exception 'expected two immutable paired bindings'; end if;
  if (select count(*) from agent.learning_benchmark_dataset_cases where split = 'HELD_OUT') <> 1 then raise exception 'expected one held-out manifest case'; end if;
end $$;

-- A mismatched aggregate must fail atomically and leave no benchmark bindings.
insert into governance.ai_evaluation_results(
  id, project_id, evaluation_type, capability, score, evidence_refs, metadata,
  evaluator_type, observed_at, created_at
)
select gen_random_uuid(), project_id, evaluation_type, capability, score,
  jsonb_build_array('fixture-mismatch-' || (metadata->>'benchmark_variant')),
  jsonb_set(metadata, '{benchmark_key}', '"fixture-benchmark-mismatch"'::jsonb),
  evaluator_type, observed_at, created_at
from governance.ai_evaluation_results
where metadata->>'benchmark_key' = 'fixture-benchmark-ok';
do $$ begin
  begin
    insert into agent.learning_candidate_benchmarks(
      id, project_id, candidate_id, benchmark_key, evaluator_id, evaluator_type,
      observed_at, baseline_version, candidate_version, case_count, baseline_score,
      candidate_score, authority_violations, adversarial_failures, evidence_refs
    ) values (
      gen_random_uuid(), '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'fixture-benchmark-mismatch',
      'fixture-evaluator', 'DETERMINISTIC', now(), 'baseline-fixture-v1', 'candidate-fixture-v2',
      1, 0.70, 0.71, 0, 0, array[(select id::text from governance.ai_evaluation_results where metadata->>'benchmark_key' = 'fixture-benchmark-mismatch' and metadata->>'benchmark_variant' = 'BASELINE'), (select id::text from governance.ai_evaluation_results where metadata->>'benchmark_key' = 'fixture-benchmark-mismatch' and metadata->>'benchmark_variant' = 'CANDIDATE')]
    );
    raise exception 'mismatched aggregate unexpectedly succeeded';
  exception when others then
    if SQLERRM not like '%aggregate%' then raise; end if;
  end;
  if (select count(*) from agent.learning_candidate_benchmarks where benchmark_key = 'fixture-benchmark-mismatch') <> 0 then raise exception 'failed benchmark was not rolled back'; end if;
  if (select count(*) from agent.learning_benchmark_case_bindings) <> 2 then raise exception 'failed bindings were not rolled back'; end if;
end $$;

-- Reusing the training case in a benchmark must be rejected by the manifest
-- gate after paired bindings are provisionally inserted.
insert into governance.ai_evaluation_results(
  id, project_id, evaluation_type, capability, score, evidence_refs, metadata,
  evaluator_type, observed_at, created_at
) select gen_random_uuid(), :'project_id'::uuid, 'AGENT_SKILL',
  'agent_skill:profiling_agent:profile_evidence_analysis', 0.70,
  jsonb_build_array('fixture-evidence-training'),
  jsonb_build_object('benchmark_case_key', :'training_case_key', 'benchmark_variant', variant, 'benchmark_split', 'HELD_OUT', 'learning_candidate_id', :'candidate_id', 'agent_key', 'profiling_agent', 'skill_key', 'profile_evidence_analysis', 'version', version, 'benchmark_evaluator_id', 'fixture-evaluator', 'benchmark_key', 'fixture-benchmark-training-leak', 'benchmark_dataset_key', 'fixture-dataset-v1', 'synthetic', 'false', 'authority_violation', 'false', 'adversarial_failure', 'false'),
  'DETERMINISTIC', now() - interval '20 minutes', now() - interval '20 minutes'
from (values ('BASELINE', :'baseline_version'), ('CANDIDATE', :'candidate_version')) v(variant, version)
;
-- The preceding two inserts are captured as psql variables only for visibility;
-- a single benchmark insert below must fail and roll back its provisional rows.
do $$ begin
  begin
    insert into agent.learning_candidate_benchmarks(
      id, project_id, candidate_id, benchmark_key, evaluator_id, evaluator_type,
      observed_at, baseline_version, candidate_version, case_count, baseline_score,
      candidate_score, authority_violations, adversarial_failures, evidence_refs
    ) values (
      gen_random_uuid(), '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'fixture-benchmark-training-leak',
      'fixture-evaluator', 'DETERMINISTIC', now(), 'baseline-fixture-v1', 'candidate-fixture-v2',
      1, 0.70, 0.70, 0, 0, array[(select id::text from governance.ai_evaluation_results where metadata->>'benchmark_key' = 'fixture-benchmark-training-leak' and metadata->>'benchmark_variant' = 'BASELINE'), (select id::text from governance.ai_evaluation_results where metadata->>'benchmark_key' = 'fixture-benchmark-training-leak' and metadata->>'benchmark_variant' = 'CANDIDATE')]
    );
    raise exception 'training case benchmark unexpectedly succeeded';
  exception when others then
    if SQLERRM not like '%HELD_OUT%' and SQLERRM not like '%manifest%' then raise; end if;
  end;
end $$;
\echo 'learning benchmark dataset registration and paired-binding SQL fixture passed'
