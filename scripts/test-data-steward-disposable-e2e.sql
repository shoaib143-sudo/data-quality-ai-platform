\set ON_ERROR_STOP on
begin;

drop schema if exists datanexus_data_steward_e2e cascade;
create schema datanexus_data_steward_e2e;

create table datanexus_data_steward_e2e.projects (
  id uuid primary key,
  name text not null
);
create table datanexus_data_steward_e2e.organization_members (
  user_id uuid primary key,
  organization_role text not null check (organization_role in ('MEMBER','ADMIN','OWNER'))
);
create table datanexus_data_steward_e2e.project_role_bindings (
  user_id uuid not null,
  project_id uuid not null references datanexus_data_steward_e2e.projects(id),
  role_key text not null,
  active boolean not null,
  primary key (user_id, project_id, role_key)
);
create table datanexus_data_steward_e2e.datasets (
  id uuid primary key,
  project_id uuid not null references datanexus_data_steward_e2e.projects(id),
  name text not null
);
create table datanexus_data_steward_e2e.dataset_versions (
  id uuid primary key,
  dataset_id uuid not null references datanexus_data_steward_e2e.datasets(id)
);
create table datanexus_data_steward_e2e.profile_runs (
  id uuid primary key,
  dataset_version_id uuid not null references datanexus_data_steward_e2e.dataset_versions(id),
  status text not null
);
create table datanexus_data_steward_e2e.quality_rule_definitions (
  id uuid primary key,
  dataset_id uuid not null references datanexus_data_steward_e2e.datasets(id),
  enabled boolean not null
);
create table datanexus_data_steward_e2e.glossary_terms (
  id uuid primary key,
  project_id uuid not null references datanexus_data_steward_e2e.projects(id),
  status text not null
);
create table datanexus_data_steward_e2e.dataset_classifications (
  id uuid primary key,
  project_id uuid not null references datanexus_data_steward_e2e.projects(id),
  status text not null
);
create table datanexus_data_steward_e2e.issues (
  id uuid primary key,
  project_id uuid not null references datanexus_data_steward_e2e.projects(id),
  status text not null
);
create table datanexus_data_steward_e2e.stewardship_assignments (
  id uuid primary key,
  project_id uuid not null references datanexus_data_steward_e2e.projects(id),
  dataset_id uuid not null references datanexus_data_steward_e2e.datasets(id),
  role text not null,
  status text not null
);
create table datanexus_data_steward_e2e.execution_modes (
  mode text primary key,
  expected_behavior text not null
);

insert into datanexus_data_steward_e2e.projects values
  ('00000000-0000-4000-8000-000000000100','Data Steward E2E Fixture'),
  ('00000000-0000-4000-8000-000000000101','Data Steward Negative Scope');

insert into datanexus_data_steward_e2e.organization_members values
  ('00000000-0000-4000-8000-000000000010','MEMBER');

insert into datanexus_data_steward_e2e.project_role_bindings values
  ('00000000-0000-4000-8000-000000000010','00000000-0000-4000-8000-000000000100','DATA_STEWARD',true);

insert into datanexus_data_steward_e2e.datasets values
  ('00000000-0000-4000-8000-000000000200','00000000-0000-4000-8000-000000000100','customer_orders');
insert into datanexus_data_steward_e2e.dataset_versions values
  ('00000000-0000-4000-8000-000000000201','00000000-0000-4000-8000-000000000200');
insert into datanexus_data_steward_e2e.profile_runs values
  ('00000000-0000-4000-8000-000000000202','00000000-0000-4000-8000-000000000201','COMPLETED');
insert into datanexus_data_steward_e2e.quality_rule_definitions values
  ('00000000-0000-4000-8000-000000000203','00000000-0000-4000-8000-000000000200',true);
insert into datanexus_data_steward_e2e.glossary_terms values
  ('00000000-0000-4000-8000-000000000205','00000000-0000-4000-8000-000000000100','DRAFT');
insert into datanexus_data_steward_e2e.dataset_classifications values
  ('00000000-0000-4000-8000-000000000206','00000000-0000-4000-8000-000000000100','SUGGESTED');
insert into datanexus_data_steward_e2e.issues values
  ('00000000-0000-4000-8000-000000000207','00000000-0000-4000-8000-000000000100','OPEN');
insert into datanexus_data_steward_e2e.stewardship_assignments values
  ('00000000-0000-4000-8000-000000000208','00000000-0000-4000-8000-000000000100','00000000-0000-4000-8000-000000000200','DATA_STEWARD','ACTIVE');

insert into datanexus_data_steward_e2e.execution_modes values
  ('OFF','manual-only'),
  ('GUIDED','approval-required'),
  ('GOVERNED_AUTO','policy-authorized-auto'),
  ('FULL_AUTONOMOUS','goal-driven-policy-bounded');

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from datanexus_data_steward_e2e.project_role_bindings
  where user_id='00000000-0000-4000-8000-000000000010'
    and active
    and role_key='DATA_STEWARD';
  if v_count <> 1 then raise exception 'expected exactly one active DATA_STEWARD binding, found %', v_count; end if;

  select count(*) into v_count
  from datanexus_data_steward_e2e.project_role_bindings
  where user_id='00000000-0000-4000-8000-000000000010'
    and project_id='00000000-0000-4000-8000-000000000101'
    and active;
  if v_count <> 0 then raise exception 'negative-scope project unexpectedly has a Data Steward binding'; end if;

  if not exists (
    select 1
    from datanexus_data_steward_e2e.datasets d
    join datanexus_data_steward_e2e.dataset_versions v on v.dataset_id=d.id
    join datanexus_data_steward_e2e.profile_runs r on r.dataset_version_id=v.id
    join datanexus_data_steward_e2e.quality_rule_definitions q on q.dataset_id=d.id
    where d.project_id='00000000-0000-4000-8000-000000000100'
      and r.status='COMPLETED'
      and q.enabled
  ) then raise exception 'fixture is missing executable profile/quality evidence'; end if;

  if not exists (select 1 from datanexus_data_steward_e2e.glossary_terms where project_id='00000000-0000-4000-8000-000000000100' and status='DRAFT')
     or not exists (select 1 from datanexus_data_steward_e2e.dataset_classifications where project_id='00000000-0000-4000-8000-000000000100' and status='SUGGESTED')
     or not exists (select 1 from datanexus_data_steward_e2e.issues where project_id='00000000-0000-4000-8000-000000000100' and status='OPEN')
     or not exists (select 1 from datanexus_data_steward_e2e.stewardship_assignments where project_id='00000000-0000-4000-8000-000000000100' and status='ACTIVE')
  then raise exception 'fixture is missing one or more canonical Data Steward workflow states'; end if;

  select count(*) into v_count from datanexus_data_steward_e2e.execution_modes;
  if v_count <> 4 then raise exception 'fixture execution-mode matrix must contain four canonical policy modes'; end if;
end
$$;

select 'Data Steward disposable E2E fixture: PASS' as result;
rollback;
