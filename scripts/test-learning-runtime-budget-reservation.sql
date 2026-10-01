-- Isolated PostgreSQL fixture for prospective learning runtime budget reservations.
-- Synthetic identities only; no production provider or application data is used.
\set ON_ERROR_STOP on
create schema if not exists extensions;
create extension if not exists pgcrypto schema extensions;
set search_path = pg_catalog, public, extensions;
do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
create schema if not exists app;
create schema if not exists app_private;
create schema if not exists governance;
create schema if not exists agent;

create table app.projects(id uuid primary key);
create function app_private.is_project_member(uuid) returns boolean language sql stable as $$ select false $$;

create table governance.ai_model_pricing_versions(
  id uuid primary key,
  project_id uuid not null references app.projects(id),
  provider text not null,
  model_id text not null,
  currency text not null,
  input_price_per_million_tokens numeric not null,
  output_price_per_million_tokens numeric not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  created_at timestamptz not null default now()
);
create view governance.ai_model_pricing_effective as
select id,project_id,provider,model_id,currency,input_price_per_million_tokens,
       output_price_per_million_tokens,effective_from,effective_to,created_at
from governance.ai_model_pricing_versions
where effective_from <= now() and (effective_to is null or effective_to > now());

create table agent.learning_candidates(
  id uuid primary key,
  project_id uuid not null references app.projects(id),
  unique(id,project_id)
);
create table agent.learning_evaluation_policies(
  id uuid primary key,
  project_id uuid not null references app.projects(id),
  candidate_id uuid not null,
  per_run_cost_budget numeric not null,
  total_cost_budget numeric not null,
  per_run_token_budget bigint not null,
  total_token_budget bigint not null,
  latency_ms_budget integer not null,
  created_at timestamptz not null default now(),
  unique(id,project_id),
  foreign key(candidate_id,project_id) references agent.learning_candidates(id,project_id)
);
create function agent.reject_learning_candidate_evidence_mutation()
returns trigger language plpgsql as $$ begin raise exception 'fixture evidence is append-only'; end $$;

\ir ../supabase/migrations/20261001084500_learning_evaluation_runtime_budget_reservations.sql

\set project_id '10000000-0000-4000-8000-000000000001'
\set candidate_id '20000000-0000-4000-8000-000000000001'
\set policy_id '30000000-0000-4000-8000-000000000001'
\set pricing_id '40000000-0000-4000-8000-000000000001'
\set correlation_id '50000000-0000-4000-8000-000000000001'

insert into app.projects(id) values (:'project_id');
insert into agent.learning_candidates(id,project_id) values (:'candidate_id',:'project_id');
insert into agent.learning_evaluation_policies(
  id,project_id,candidate_id,per_run_cost_budget,total_cost_budget,
  per_run_token_budget,total_token_budget,latency_ms_budget
) values (:'policy_id',:'project_id',:'candidate_id',1,2,100,200,1000);
insert into governance.ai_model_pricing_versions(
  id,project_id,provider,model_id,currency,input_price_per_million_tokens,
  output_price_per_million_tokens,effective_from
) values (:'pricing_id',:'project_id','openai_compatible','fixture-model','USD',100,100,now()-interval '1 hour');

select (agent.reserve_learning_evaluation_runtime_budget(
  :'project_id',:'policy_id',:'candidate_id','BASELINE',
  '60000000-0000-4000-8000-000000000001',:'correlation_id',
  'openai_compatible','fixture-model',:'pricing_id'
)->>'reservationId') as reservation_1 \gset
select (agent.reserve_learning_evaluation_runtime_budget(
  :'project_id',:'policy_id',:'candidate_id','CANDIDATE',
  '60000000-0000-4000-8000-000000000002',:'correlation_id',
  'openai_compatible','fixture-model',:'pricing_id'
)->>'reservationId') as reservation_2 \gset

-- Two full reservations consume the complete experiment token/USD ceilings.
do $$
begin
  begin
    perform agent.reserve_learning_evaluation_runtime_budget(
      '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001','CANDIDATE',
      '60000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000001',
      'openai_compatible','fixture-model','40000000-0000-4000-8000-000000000001'
    );
    raise exception 'third full reservation unexpectedly exceeded the locked total budget';
  exception when others then
    if SQLERRM not like '%budget exhausted%' then raise; end if;
  end;
end $$;

-- Reconciliation releases only the unused portion; then one more full reservation fits.
select agent.record_learning_evaluation_runtime_event(
  :'project_id',:'policy_id',:'reservation_1',false,true,0,0,100,'fixture reconciled'
);
select (agent.reserve_learning_evaluation_runtime_budget(
  :'project_id',:'policy_id',:'candidate_id','CANDIDATE',
  '60000000-0000-4000-8000-000000000003',:'correlation_id',
  'openai_compatible','fixture-model',:'pricing_id'
)->>'reservationId') as reservation_3 \gset

-- Unknown accounting is a fail-closed stop even when nominal budget remains.
select agent.record_learning_evaluation_runtime_event(
  :'project_id',:'policy_id',:'reservation_2',false,false,null,null,null,'fixture usage unavailable'
);
do $$
begin
  begin
    perform agent.reserve_learning_evaluation_runtime_budget(
      '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001','CANDIDATE',
      '60000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000001',
      'openai_compatible','fixture-model','40000000-0000-4000-8000-000000000001'
    );
    raise exception 'unresolved accounting unexpectedly allowed another provider call';
  exception when others then
    if SQLERRM not like '%unresolved or exceeded%' then raise; end if;
  end;
end $$;

-- Delayed authoritative accounting can resolve a previously unknown reservation.
select agent.record_learning_evaluation_runtime_event(
  :'project_id',:'policy_id',:'reservation_2',false,true,0,0,100,'fixture delayed accounting'
);
select agent.record_learning_evaluation_runtime_event(
  :'project_id',:'policy_id',:'reservation_3',true,true,0,0,0,'fixture provider never started'
);

-- A crashed reservation with no event remains blocking after its exact latency deadline.
\set candidate_2 '20000000-0000-4000-8000-000000000002'
\set policy_2 '30000000-0000-4000-8000-000000000002'
insert into agent.learning_candidates(id,project_id) values (:'candidate_2',:'project_id');
insert into agent.learning_evaluation_policies(
  id,project_id,candidate_id,per_run_cost_budget,total_cost_budget,
  per_run_token_budget,total_token_budget,latency_ms_budget,created_at
) values (:'policy_2',:'project_id',:'candidate_2',1,3,100,300,100,now());
insert into agent.learning_evaluation_runtime_reservations(
  id,project_id,policy_id,candidate_id,variant,invocation_id,execution_correlation_id,
  provider_id,model_name,pricing_version_id,reserved_cost_usd,reserved_tokens,latency_ms_budget,created_at
) values (
  '70000000-0000-4000-8000-000000000001',:'project_id',:'policy_2',:'candidate_2','CANDIDATE',
  '60000000-0000-4000-8000-000000000010',:'correlation_id','openai_compatible','fixture-model',
  :'pricing_id',1,100,100,now()-interval '1 second'
);
do $$
begin
  begin
    perform agent.reserve_learning_evaluation_runtime_budget(
      '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002',
      '20000000-0000-4000-8000-000000000002','CANDIDATE',
      '60000000-0000-4000-8000-000000000011','50000000-0000-4000-8000-000000000001',
      'openai_compatible','fixture-model','40000000-0000-4000-8000-000000000001'
    );
    raise exception 'stale crashed reservation unexpectedly allowed another call';
  exception when others then
    if SQLERRM not like '%unresolved or exceeded%' then raise; end if;
  end;
end $$;

-- Append-only evidence cannot be rewritten after the fact.
do $$
begin
  begin
    update agent.learning_evaluation_runtime_events set reason='tampered' where reservation_id=:'reservation_1'::uuid;
    raise exception 'runtime event mutation unexpectedly succeeded';
  exception when others then
    if SQLERRM not like '%append-only%' then raise; end if;
  end;
end $$;

\echo 'learning evaluation runtime reservation and crash-recovery SQL fixture passed'
