create table if not exists governance.access_roles (
  role_key text primary key,
  name text not null,
  description text,
  capabilities text[] not null default '{}',
  system_role boolean not null default true,
  created_at timestamptz not null default now()
);

insert into governance.access_roles(role_key,name,description,capabilities,system_role) values
('READ_ONLY','Read only consumer','Can browse governed assets and evidence.',array['catalog.read','glossary.read','lineage.read','quality.read','observability.read','audit.read'],true),
('DATA_STEWARD','Data steward','Operates metadata, stewardship, issues, classifications and certifications.',array['catalog.read','catalog.update','glossary.read','glossary.manage','lineage.read','quality.read','quality.execute','observability.read','issues.manage','classification.review','certification.request','certification.review','stewardship.manage','audit.read'],true),
('DATA_OWNER','Data owner','Owns governed dataset policy, certification and control decisions.',array['catalog.read','catalog.update','glossary.read','lineage.read','quality.read','quality.manage','quality.execute','observability.read','observability.manage','issues.manage','classification.review','policy.approve','certification.request','certification.review','contract.manage','audit.read'],true),
('QUALITY_MANAGER','Quality manager','Manages quality controls and execution.',array['catalog.read','quality.read','quality.manage','quality.execute','quality.exception.approve','observability.read','issues.manage'],true),
('POLICY_APPROVER','Policy approver','Approves classifications, contracts, certifications and policy changes.',array['catalog.read','classification.review','policy.approve','certification.review','contract.approve','audit.read'],true)
on conflict(role_key) do update set name=excluded.name,description=excluded.description,capabilities=excluded.capabilities;

create table if not exists governance.project_role_bindings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_key text not null references governance.access_roles(role_key) on delete restrict,
  active boolean not null default true,
  assigned_by uuid references auth.users(id) on delete set null,
  assigned_at timestamptz not null default now(),
  expires_at timestamptz,
  unique(project_id,user_id,role_key)
);

alter table governance.access_roles enable row level security;
alter table governance.project_role_bindings enable row level security;
drop policy if exists access_roles_read on governance.access_roles;
create policy access_roles_read on governance.access_roles for select to authenticated using (true);
drop policy if exists project_role_bindings_access on governance.project_role_bindings;
create policy project_role_bindings_access on governance.project_role_bindings
for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));
grant select on governance.access_roles to authenticated;
grant select,insert,update,delete on governance.project_role_bindings to authenticated;
grant all on governance.access_roles,governance.project_role_bindings to service_role;

create or replace function governance.has_project_capability(p_project_id uuid,p_user_id uuid,p_capability text)
returns boolean language sql stable security definer
set search_path=pg_catalog,governance,app
as $$
  select
    exists(
      select 1 from app.projects p join app.organization_members om on om.organization_id=p.organization_id
      where p.id=p_project_id and om.user_id=p_user_id and om.role in ('OWNER','ADMIN')
    )
    or exists(
      select 1 from governance.project_role_bindings b join governance.access_roles r on r.role_key=b.role_key
      where b.project_id=p_project_id and b.user_id=p_user_id and b.active=true
        and (b.expires_at is null or b.expires_at>now()) and p_capability=any(r.capabilities)
    )
    or (
      p_capability=any(array['catalog.read','glossary.read','lineage.read','quality.read','observability.read','audit.read'])
      and exists(
        select 1 from app.projects p join app.organization_members om on om.organization_id=p.organization_id
        where p.id=p_project_id and om.user_id=p_user_id
      )
    );
$$;
revoke execute on function governance.has_project_capability(uuid,uuid,text) from public,anon;
grant execute on function governance.has_project_capability(uuid,uuid,text) to authenticated,service_role;

alter table orchestration.job_queue add column if not exists idempotency_key text;
create unique index if not exists job_queue_idempotency_unique
on orchestration.job_queue(project_id,idempotency_key) where idempotency_key is not null;

create table if not exists orchestration.event_outbox (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  correlation_id uuid,
  idempotency_key text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING' check(status in ('PENDING','PROCESSING','DONE','FAILED','DEAD')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  unique(project_id,idempotency_key)
);
create index if not exists event_outbox_claim_idx on orchestration.event_outbox(status,available_at,created_at);
alter table orchestration.event_outbox enable row level security;
drop policy if exists event_outbox_project_read on orchestration.event_outbox;
create policy event_outbox_project_read on orchestration.event_outbox for select to authenticated using(app_private.is_project_member(project_id));
grant select on orchestration.event_outbox to authenticated;
grant all on orchestration.event_outbox to service_role;

create or replace function orchestration.emit_event(
  p_project_id uuid,p_event_type text,p_aggregate_type text,p_aggregate_id uuid,p_idempotency_key text,
  p_payload jsonb default '{}'::jsonb,p_correlation_id uuid default null
) returns uuid language plpgsql security definer set search_path=pg_catalog,orchestration
as $$
declare v_id uuid;
begin
  insert into orchestration.event_outbox(project_id,event_type,aggregate_type,aggregate_id,idempotency_key,payload,correlation_id)
  values(p_project_id,p_event_type,p_aggregate_type,p_aggregate_id,p_idempotency_key,coalesce(p_payload,'{}'::jsonb),p_correlation_id)
  on conflict(project_id,idempotency_key) do update set payload=excluded.payload
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function orchestration.emit_event(uuid,text,text,uuid,text,jsonb,uuid) from public,anon,authenticated;
grant execute on function orchestration.emit_event(uuid,text,text,uuid,text,jsonb,uuid) to service_role;

create or replace function orchestration.claim_events(p_worker text,p_limit integer default 20)
returns setof orchestration.event_outbox language plpgsql security definer set search_path=pg_catalog,orchestration
as $$
begin
  return query
  with candidates as (
    select id from orchestration.event_outbox
    where status in ('PENDING','FAILED') and available_at<=now()
      and (lease_expires_at is null or lease_expires_at<now()) and attempts<max_attempts
    order by created_at for update skip locked
    limit greatest(1,least(coalesce(p_limit,20),100))
  )
  update orchestration.event_outbox e
  set status='PROCESSING',lease_owner=p_worker,lease_expires_at=now()+interval '5 minutes',attempts=e.attempts+1,last_error=null
  from candidates c where e.id=c.id returning e.*;
end;
$$;
revoke execute on function orchestration.claim_events(text,integer) from public,anon,authenticated;
grant execute on function orchestration.claim_events(text,integer) to service_role;

create table if not exists governance.object_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references app.projects(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  revision_number integer not null,
  operation text not null check(operation in ('INSERT','UPDATE','DELETE')),
  snapshot jsonb not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  unique(entity_type,entity_id,revision_number)
);
create index if not exists object_revisions_entity_idx on governance.object_revisions(entity_type,entity_id,revision_number desc);
alter table governance.object_revisions enable row level security;
drop policy if exists object_revisions_access on governance.object_revisions;
create policy object_revisions_access on governance.object_revisions
for select to authenticated using(project_id is null or app_private.is_project_member(project_id));
grant select on governance.object_revisions to authenticated;
grant all on governance.object_revisions to service_role;

create or replace function governance.capture_revision()
returns trigger language plpgsql security definer set search_path=pg_catalog,governance
as $$
declare
  v_row jsonb := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_entity_id uuid;
  v_project_id uuid;
  v_revision integer;
begin
  v_entity_id := coalesce(nullif(v_row->>'id','')::uuid,nullif(v_row->>'dataset_id','')::uuid);
  v_project_id := nullif(v_row->>'project_id','')::uuid;
  if v_entity_id is null then return case when tg_op='DELETE' then old else new end; end if;
  select coalesce(max(revision_number),0)+1 into v_revision from governance.object_revisions
  where entity_type=tg_table_schema||'.'||tg_table_name and entity_id=v_entity_id;
  insert into governance.object_revisions(project_id,entity_type,entity_id,revision_number,operation,snapshot)
  values(v_project_id,tg_table_schema||'.'||tg_table_name,v_entity_id,v_revision,tg_op,v_row);
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke execute on function governance.capture_revision() from public,anon,authenticated;
grant execute on function governance.capture_revision() to service_role;

create table if not exists governance.data_contracts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null unique references catalog.datasets(id) on delete cascade,
  name text not null,
  status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','RETIRED')),
  current_version integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists governance.data_contract_versions (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references governance.data_contracts(id) on delete cascade,
  version_number integer not null,
  schema_hash text,
  compatibility_policy text not null default 'BACKWARD' check(compatibility_policy in ('NONE','BACKWARD','FORWARD','FULL')),
  freshness_sla_hours integer check(freshness_sla_hours is null or freshness_sla_hours>0),
  row_count_min bigint check(row_count_min is null or row_count_min>=0),
  row_count_max bigint check(row_count_max is null or row_count_max>=0),
  quality_requirements jsonb not null default '{}'::jsonb,
  critical_columns text[] not null default '{}',
  metadata jsonb not null default '{}'::jsonb,
  change_reason text,
  status text not null default 'DRAFT' check(status in ('DRAFT','ACTIVE','RETIRED')),
  approved_by uuid references auth.users(id) on delete set null,
  effective_at timestamptz,
  created_at timestamptz not null default now(),
  unique(contract_id,version_number)
);
create table if not exists governance.data_contract_evaluations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  contract_id uuid not null references governance.data_contracts(id) on delete cascade,
  contract_version_id uuid not null references governance.data_contract_versions(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  profile_run_id uuid not null references profiling.profile_runs(id) on delete cascade,
  status text not null check(status in ('PASSED','FAILED','ERROR')),
  checks jsonb not null default '{}'::jsonb,
  evaluated_at timestamptz not null default now(),
  unique(contract_version_id,profile_run_id)
);

create table if not exists governance.workflow_definitions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  workflow_key text not null,
  name text not null,
  entity_type text not null,
  version integer not null default 1,
  steps jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(project_id,workflow_key,version)
);
create table if not exists governance.workflow_instances (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  workflow_definition_id uuid not null references governance.workflow_definitions(id) on delete restrict,
  entity_type text not null,
  entity_id uuid not null,
  status text not null default 'RUNNING' check(status in ('RUNNING','APPROVED','REJECTED','CANCELLED','ERROR')),
  current_step integer not null default 0,
  context jsonb not null default '{}'::jsonb,
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists governance.workflow_actions (
  id uuid primary key default gen_random_uuid(),
  workflow_instance_id uuid not null references governance.workflow_instances(id) on delete cascade,
  step_index integer not null,
  action text not null check(action in ('APPROVE','REJECT','COMMENT','CANCEL')),
  actor_user_id uuid references auth.users(id) on delete set null,
  notes text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists orchestration.capacity_policies (
  project_id uuid primary key references app.projects(id) on delete cascade,
  max_concurrent_jobs integer not null default 4 check(max_concurrent_jobs between 1 and 100),
  max_jobs_per_hour integer not null default 120 check(max_jobs_per_hour between 1 and 100000),
  max_profile_rows integer not null default 10000 check(max_profile_rows between 100 and 10000000),
  max_file_bytes bigint not null default 52428800 check(max_file_bytes between 1048576 and 10737418240),
  max_notifications_per_hour integer not null default 500 check(max_notifications_per_hour between 1 and 100000),
  updated_at timestamptz not null default now()
);

create table if not exists profiling.sampling_policies (
  dataset_id uuid primary key references catalog.datasets(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  mode text not null default 'FIXED' check(mode in ('FULL','FIXED','PERCENT')),
  max_rows integer not null default 1000 check(max_rows between 100 and 10000000),
  sample_percent numeric not null default 10 check(sample_percent>0 and sample_percent<=100),
  deterministic_seed integer not null default 17,
  updated_at timestamptz not null default now()
);

create table if not exists orchestration.platform_telemetry (
  id bigint generated always as identity primary key,
  project_id uuid references app.projects(id) on delete cascade,
  metric_key text not null,
  numeric_value numeric not null,
  dimensions jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);
create index if not exists platform_telemetry_metric_idx on orchestration.platform_telemetry(metric_key,observed_at desc);

create table if not exists governance.backup_restore_drills (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references app.projects(id) on delete cascade,
  drill_type text not null check(drill_type in ('BACKUP_VERIFICATION','RESTORE_REHEARSAL','DISASTER_RECOVERY')),
  status text not null default 'PLANNED' check(status in ('PLANNED','RUNNING','PASSED','FAILED')),
  environment text not null default 'production',
  evidence jsonb not null default '{}'::jsonb,
  notes text,
  performed_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists catalog.discovery_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  status text not null default 'RUNNING' check(status in ('RUNNING','COMPLETED','FAILED')),
  assets_discovered integer not null default 0,
  schema_snapshot jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);
create table if not exists catalog.discovered_assets (
  id uuid primary key default gen_random_uuid(),
  discovery_run_id uuid not null references catalog.discovery_runs(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  asset_type text not null,
  namespace text,
  name text not null,
  columns jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  unique(discovery_run_id,asset_type,namespace,name)
);

alter table profiling.quality_rule_exceptions
  add column if not exists status text not null default 'OPEN',
  add column if not exists waiver_reason text,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists expires_at timestamptz,
  add column if not exists resolution_notes text;

alter table governance.data_contracts enable row level security;
alter table governance.data_contract_versions enable row level security;
alter table governance.data_contract_evaluations enable row level security;
alter table governance.workflow_definitions enable row level security;
alter table governance.workflow_instances enable row level security;
alter table governance.workflow_actions enable row level security;
alter table orchestration.capacity_policies enable row level security;
alter table profiling.sampling_policies enable row level security;
alter table orchestration.platform_telemetry enable row level security;
alter table governance.backup_restore_drills enable row level security;
alter table catalog.discovery_runs enable row level security;
alter table catalog.discovered_assets enable row level security;

drop policy if exists data_contracts_access on governance.data_contracts;
create policy data_contracts_access on governance.data_contracts for all to authenticated using(app_private.is_project_member(project_id)) with check(app_private.is_project_member(project_id));
drop policy if exists data_contract_versions_access on governance.data_contract_versions;
create policy data_contract_versions_access on governance.data_contract_versions for select to authenticated using(exists(select 1 from governance.data_contracts c where c.id=contract_id and app_private.is_project_member(c.project_id)));
drop policy if exists data_contract_evaluations_access on governance.data_contract_evaluations;
create policy data_contract_evaluations_access on governance.data_contract_evaluations for select to authenticated using(app_private.is_project_member(project_id));
drop policy if exists workflow_definitions_access on governance.workflow_definitions;
create policy workflow_definitions_access on governance.workflow_definitions for all to authenticated using(app_private.is_project_member(project_id)) with check(app_private.is_project_member(project_id));
drop policy if exists workflow_instances_access on governance.workflow_instances;
create policy workflow_instances_access on governance.workflow_instances for all to authenticated using(app_private.is_project_member(project_id)) with check(app_private.is_project_member(project_id));
drop policy if exists workflow_actions_access on governance.workflow_actions;
create policy workflow_actions_access on governance.workflow_actions for select to authenticated using(exists(select 1 from governance.workflow_instances i where i.id=workflow_instance_id and app_private.is_project_member(i.project_id)));
drop policy if exists capacity_policies_access on orchestration.capacity_policies;
create policy capacity_policies_access on orchestration.capacity_policies for all to authenticated using(app_private.is_project_member(project_id)) with check(app_private.is_project_member(project_id));
drop policy if exists sampling_policies_access on profiling.sampling_policies;
create policy sampling_policies_access on profiling.sampling_policies for all to authenticated using(app_private.is_project_member(project_id)) with check(app_private.is_project_member(project_id));
drop policy if exists platform_telemetry_access on orchestration.platform_telemetry;
create policy platform_telemetry_access on orchestration.platform_telemetry for select to authenticated using(project_id is null or app_private.is_project_member(project_id));
drop policy if exists backup_restore_drills_access on governance.backup_restore_drills;
create policy backup_restore_drills_access on governance.backup_restore_drills for all to authenticated using(project_id is null or app_private.is_project_member(project_id)) with check(project_id is null or app_private.is_project_member(project_id));
drop policy if exists discovery_runs_access on catalog.discovery_runs;
create policy discovery_runs_access on catalog.discovery_runs for select to authenticated using(app_private.is_project_member(project_id));
drop policy if exists discovered_assets_access on catalog.discovered_assets;
create policy discovered_assets_access on catalog.discovered_assets for select to authenticated using(exists(select 1 from catalog.discovery_runs d where d.id=discovery_run_id and app_private.is_project_member(d.project_id)));

grant select,insert,update,delete on governance.data_contracts,governance.workflow_definitions,governance.workflow_instances to authenticated;
grant select on governance.data_contract_versions,governance.data_contract_evaluations,governance.workflow_actions,orchestration.platform_telemetry,catalog.discovery_runs,catalog.discovered_assets to authenticated;
grant select,insert,update on orchestration.capacity_policies,profiling.sampling_policies,governance.backup_restore_drills to authenticated;
grant all on governance.data_contracts,governance.data_contract_versions,governance.data_contract_evaluations,governance.workflow_definitions,governance.workflow_instances,governance.workflow_actions,governance.backup_restore_drills to service_role;
grant all on orchestration.capacity_policies,orchestration.platform_telemetry to service_role;
grant all on profiling.sampling_policies to service_role;
grant all on catalog.discovery_runs,catalog.discovered_assets to service_role;

drop trigger if exists revision_glossary_terms on governance.glossary_terms;
create trigger revision_glossary_terms after insert or update or delete on governance.glossary_terms for each row execute function governance.capture_revision();
drop trigger if exists revision_classification_policies on governance.classification_policies;
create trigger revision_classification_policies after insert or update or delete on governance.classification_policies for each row execute function governance.capture_revision();
drop trigger if exists revision_dataset_classifications on governance.dataset_classifications;
create trigger revision_dataset_classifications after insert or update or delete on governance.dataset_classifications for each row execute function governance.capture_revision();
drop trigger if exists revision_certification_requests on governance.certification_requests;
create trigger revision_certification_requests after insert or update or delete on governance.certification_requests for each row execute function governance.capture_revision();
drop trigger if exists revision_quality_rules on profiling.quality_rule_definitions;
create trigger revision_quality_rules after insert or update or delete on profiling.quality_rule_definitions for each row execute function governance.capture_revision();
drop trigger if exists revision_observability_policies on profiling.observability_policies;
create trigger revision_observability_policies after insert or update or delete on profiling.observability_policies for each row execute function governance.capture_revision();

select pg_notify('pgrst','reload schema');
