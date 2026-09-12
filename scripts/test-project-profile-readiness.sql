\set ON_ERROR_STOP on

create schema if not exists catalog;
create schema if not exists profiling;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end
$$;

create table catalog.data_sources (
  id uuid primary key,
  project_id uuid not null,
  source_type text not null,
  status text not null
);

create table catalog.datasets (
  id uuid primary key,
  project_id uuid not null,
  data_source_id uuid not null,
  status text not null
);

create table catalog.dataset_versions (
  id uuid primary key,
  dataset_id uuid not null,
  version_number bigint not null,
  source_uri text,
  content_hash text,
  schema_hash text,
  created_at timestamptz not null default now()
);

create table catalog.source_operational_readiness (
  source_id uuid,
  project_id uuid,
  operational_state text,
  latest_error_message text
);

create table catalog.source_scopes (
  id uuid primary key,
  project_id uuid not null,
  source_id uuid not null,
  status text not null,
  current_version_id uuid,
  updated_at timestamptz not null default now()
);

create table catalog.source_scope_versions (
  id uuid primary key,
  scope_id uuid not null,
  project_id uuid not null,
  source_id uuid not null
);

create table catalog.discovery_manifests (
  id uuid primary key,
  project_id uuid not null,
  source_id uuid not null,
  scope_id uuid not null,
  scope_version_id uuid not null,
  discovery_run_id uuid not null,
  failed_item_count integer not null,
  truncated boolean not null,
  complete boolean not null,
  manifest_hash text not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table profiling.dataset_execution_sources (
  id uuid primary key,
  dataset_version_id uuid not null,
  active boolean not null
);

\ir ../supabase/migrations/20260912173500_project_profile_readiness_v2.sql

-- Project 1: a fully READY JDBC dataset with two versions. Only latest is executable.
insert into catalog.data_sources(id,project_id,source_type,status) values
('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000010','JDBC','ACTIVE');
insert into catalog.datasets(id,project_id,data_source_id,status) values
('00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000012','ACTIVE');
insert into catalog.dataset_versions(id,dataset_id,version_number,created_at) values
('00000000-0000-0000-0000-000000000019','00000000-0000-0000-0000-000000000011',1,now()-interval '2 hours'),
('00000000-0000-0000-0000-000000000015','00000000-0000-0000-0000-000000000011',2,now()-interval '1 hour');
insert into catalog.source_operational_readiness(source_id,project_id,operational_state) values
('00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000010','OBSERVED_READY');
insert into catalog.source_scopes(id,project_id,source_id,status,current_version_id) values
('00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000012','ACTIVE','00000000-0000-0000-0000-000000000014');
insert into catalog.source_scope_versions(id,scope_id,project_id,source_id) values
('00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000012');
insert into profiling.dataset_execution_sources(id,dataset_version_id,active) values
('00000000-0000-0000-0000-000000000016','00000000-0000-0000-0000-000000000015',true);
insert into catalog.discovery_manifests(id,project_id,source_id,scope_id,scope_version_id,discovery_run_id,failed_item_count,truncated,complete,manifest_hash,created_at,completed_at) values
('00000000-0000-0000-0000-000000000018','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-000000000017',0,false,true,repeat('a',64),now()-interval '40 minutes',now()-interval '39 minutes');

do $$
declare r jsonb;
begin
  r := catalog.verify_dataset_profile_readiness('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011');
  if r->>'state' <> 'READY' or not (r->>'profiling_ready')::boolean then raise exception 'expected READY dataset, got %', r; end if;
  if r->>'readiness_policy' <> 'JDBC_V1' then raise exception 'expected JDBC_V1 policy, got %', r; end if;

  r := catalog.verify_project_profile_readiness('00000000-0000-0000-0000-000000000010');
  if r->>'state' <> 'READY' or (r->>'profiling_ready')::int <> 1 then raise exception 'expected READY project, got %', r; end if;

  r := catalog.verify_dataset_version_profile_readiness('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000019');
  if r->>'state' <> 'BLOCKED' or not (r->'blockers' ? 'DATASET_VERSION_NOT_LATEST') then raise exception 'old version did not fail closed: %', r; end if;
end
$$;

-- A newer failed discovery attempt must not erase the latest successful evidence.
insert into catalog.discovery_manifests(id,project_id,source_id,scope_id,scope_version_id,discovery_run_id,failed_item_count,truncated,complete,manifest_hash,created_at,completed_at) values
('00000000-0000-0000-0000-00000000001a','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000014','00000000-0000-0000-0000-00000000001b',2,false,false,repeat('b',64),now()-interval '10 minutes',now()-interval '9 minutes');

do $$
declare r jsonb;
begin
  r := catalog.verify_dataset_profile_readiness('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011');
  if r->>'state' <> 'READY' or r->>'discovery_run_id' <> '00000000-0000-0000-0000-000000000017' then raise exception 'latest successful evidence semantics failed: %', r; end if;
end
$$;

-- Moving the current scope version invalidates evidence from the old scope version.
insert into catalog.source_scope_versions(id,scope_id,project_id,source_id) values
('00000000-0000-0000-0000-00000000001c','00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000012');
update catalog.source_scopes set current_version_id='00000000-0000-0000-0000-00000000001c', updated_at=now() where id='00000000-0000-0000-0000-000000000013';

do $$
declare r jsonb;
begin
  r := catalog.verify_dataset_profile_readiness('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011');
  if r->>'state' <> 'BLOCKED' or not (r->'blockers' ? 'DISCOVERY_SUCCESS_EVIDENCE_NOT_AVAILABLE') then raise exception 'stale scope evidence was incorrectly accepted: %', r; end if;
end
$$;

insert into catalog.discovery_manifests(id,project_id,source_id,scope_id,scope_version_id,discovery_run_id,failed_item_count,truncated,complete,manifest_hash,created_at,completed_at) values
('00000000-0000-0000-0000-00000000001d','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000012','00000000-0000-0000-0000-000000000013','00000000-0000-0000-0000-00000000001c','00000000-0000-0000-0000-00000000001e',0,false,true,repeat('c',64),now()-interval '5 minutes',now()-interval '4 minutes');

-- Individual blockers fail closed and recover deterministically.
do $$
declare r jsonb;
begin
  update catalog.datasets set status='INACTIVE' where id='00000000-0000-0000-0000-000000000011';
  r := catalog.verify_dataset_profile_readiness('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011');
  if r->>'state' <> 'BLOCKED' or not (r->'blockers' ? 'DATASET_NOT_ACTIVE') then raise exception 'inactive dataset blocker failed: %', r; end if;
  update catalog.datasets set status='ACTIVE' where id='00000000-0000-0000-0000-000000000011';

  update catalog.data_sources set status='INACTIVE' where id='00000000-0000-0000-0000-000000000012';
  r := catalog.verify_dataset_profile_readiness('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011');
  if r->>'state' <> 'BLOCKED' or not (r->'blockers' ? 'SOURCE_NOT_ACTIVE') then raise exception 'inactive source blocker failed: %', r; end if;
  update catalog.data_sources set status='ACTIVE' where id='00000000-0000-0000-0000-000000000012';

  update catalog.source_operational_readiness set operational_state='BLOCKED', latest_error_message='Connection test failed.' where source_id='00000000-0000-0000-0000-000000000012';
  r := catalog.verify_dataset_profile_readiness('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011');
  if r->>'state' <> 'BLOCKED' or not (r->'blockers' ? 'SOURCE_NOT_OBSERVED_READY') then raise exception 'observed readiness blocker failed: %', r; end if;
  if r#>>'{remediation,SOURCE_NOT_OBSERVED_READY,root_cause}' <> 'Connection test failed.' then raise exception 'simple-English root cause did not preserve source evidence: %', r; end if;
  update catalog.source_operational_readiness set operational_state='OBSERVED_READY', latest_error_message=null where source_id='00000000-0000-0000-0000-000000000012';

  update profiling.dataset_execution_sources set active=false where id='00000000-0000-0000-0000-000000000016';
  r := catalog.verify_dataset_profile_readiness('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000011');
  if r->>'state' <> 'BLOCKED' or not (r->'blockers' ? 'EXECUTION_SOURCE_NOT_BOUND') then raise exception 'execution binding blocker failed: %', r; end if;
  update profiling.dataset_execution_sources set active=true where id='00000000-0000-0000-0000-000000000016';
end
$$;

-- Project 2: a source whose readiness policy is not onboarded is NOT_ASSESSED.
insert into catalog.data_sources(id,project_id,source_type,status) values
('00000000-0000-0000-0000-000000000022','00000000-0000-0000-0000-000000000020','FILE','ACTIVE');
insert into catalog.datasets(id,project_id,data_source_id,status) values
('00000000-0000-0000-0000-000000000021','00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000022','ACTIVE');

do $$
declare r jsonb;
begin
  r := catalog.verify_dataset_profile_readiness('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000021');
  if r->>'state' <> 'NOT_ASSESSED' or not (r->'blockers' ? 'READINESS_RULE_NOT_ONBOARDED') then raise exception 'unonboarded source must be NOT_ASSESSED: %', r; end if;
  r := catalog.verify_project_profile_readiness('00000000-0000-0000-0000-000000000020');
  if r->>'state' <> 'NOT_ASSESSED' then raise exception 'only unassessed datasets must yield NOT_ASSESSED project: %', r; end if;
end
$$;

-- Zero-dataset project is NOT_ASSESSED, not vacuously READY.
do $$
declare r jsonb;
begin
  r := catalog.verify_project_profile_readiness('00000000-0000-0000-0000-000000000001');
  if r->>'state' <> 'NOT_ASSESSED' or (r->>'datasets_assessed')::int <> 0 or (r->>'valid')::boolean then raise exception 'empty project semantics failed: %', r; end if;
end
$$;

-- Add an unassessed peer to project 1. READY dataset remains independently READY;
-- project becomes PARTIALLY_READY and can_profile_any remains true.
insert into catalog.data_sources(id,project_id,source_type,status) values
('00000000-0000-0000-0000-000000000032','00000000-0000-0000-0000-000000000010','OBJECT_STORE','ACTIVE');
insert into catalog.datasets(id,project_id,data_source_id,status) values
('00000000-0000-0000-0000-000000000031','00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000032','ACTIVE');

do $$
declare r jsonb; d jsonb;
begin
  r := catalog.verify_project_profile_readiness('00000000-0000-0000-0000-000000000010');
  if r->>'state' <> 'PARTIALLY_READY' or not (r->>'can_profile_any')::boolean or (r->>'profiling_ready')::int <> 1 then raise exception 'partial readiness aggregation failed: %', r; end if;
  d := catalog.verify_dataset_version_profile_readiness('00000000-0000-0000-0000-000000000010','00000000-0000-0000-0000-000000000015');
  if d->>'state' <> 'READY' then raise exception 'healthy dataset was blocked by partially-ready peer: %', d; end if;
end
$$;

-- If the only assessable dataset becomes blocked, project is BLOCKED even with
-- additional NOT_ASSESSED datasets.
update catalog.datasets set status='INACTIVE' where id='00000000-0000-0000-0000-000000000011';
do $$
declare r jsonb;
begin
  r := catalog.verify_project_profile_readiness('00000000-0000-0000-0000-000000000010');
  if r->>'state' <> 'BLOCKED' or (r->>'profiling_ready')::int <> 0 or (r->>'blocked')::int <> 1 then raise exception 'blocked aggregation failed: %', r; end if;
end
$$;
update catalog.datasets set status='ACTIVE' where id='00000000-0000-0000-0000-000000000011';

-- Cross-project lookup and missing dataset/version fail closed without leaking data.
do $$
declare r jsonb;
begin
  r := catalog.verify_dataset_version_profile_readiness('00000000-0000-0000-0000-000000000020','00000000-0000-0000-0000-000000000015');
  if r->>'state' <> 'NOT_ASSESSED' or not (r->'blockers' ? 'DATASET_VERSION_NOT_FOUND') then raise exception 'cross-project version isolation failed: %', r; end if;
  r := catalog.verify_dataset_profile_readiness('00000000-0000-0000-0000-000000000010','ffffffff-ffff-ffff-ffff-ffffffffffff');
  if r->>'state' <> 'NOT_ASSESSED' or not (r->'blockers' ? 'DATASET_NOT_FOUND') then raise exception 'missing dataset fail-closed behavior failed: %', r; end if;
end
$$;

-- Function ACLs remain explicit and anonymous execution remains revoked.
do $$
begin
  if has_function_privilege('anon','catalog.verify_project_profile_readiness(uuid)','EXECUTE') then raise exception 'anon unexpectedly has project readiness execute'; end if;
  if has_function_privilege('anon','catalog.verify_dataset_profile_readiness(uuid,uuid)','EXECUTE') then raise exception 'anon unexpectedly has dataset readiness execute'; end if;
  if has_function_privilege('anon','catalog.verify_dataset_version_profile_readiness(uuid,uuid)','EXECUTE') then raise exception 'anon unexpectedly has version readiness execute'; end if;
  if not has_function_privilege('authenticated','catalog.verify_project_profile_readiness(uuid)','EXECUTE') then raise exception 'authenticated missing project readiness execute'; end if;
  if not has_function_privilege('service_role','catalog.verify_dataset_version_profile_readiness(uuid,uuid)','EXECUTE') then raise exception 'service_role missing version readiness execute'; end if;
end
$$;

select 'project profile readiness V2 dynamic SQL tests passed' as result;
