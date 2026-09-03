-- Operational lineage discovery and governance audit trail.
alter table governance.lineage_edges enable row level security;
alter table governance.audit_events enable row level security;

drop policy if exists lineage_edges_project_access on governance.lineage_edges;
create policy lineage_edges_project_access on governance.lineage_edges
for all to authenticated using (app_private.is_project_member(project_id))
with check (app_private.is_project_member(project_id));

drop policy if exists audit_events_project_access on governance.audit_events;
create policy audit_events_project_access on governance.audit_events
for select to authenticated using (project_id is null or app_private.is_project_member(project_id));

grant select,insert,update,delete on governance.lineage_edges to authenticated;
grant select on governance.audit_events to authenticated;
grant all on governance.lineage_edges,governance.audit_events to service_role;

create or replace function governance.record_lineage_for_dataset()
returns trigger language plpgsql security definer set search_path=pg_catalog,governance,catalog as $$
begin
  if new.data_source_id is not null then
    insert into governance.lineage_edges(project_id,source_type,source_id,target_type,target_id,relationship,metadata)
    values(new.project_id,'DATA_SOURCE',new.data_source_id,'DATASET',new.id,'PROVIDES',jsonb_build_object('auto_discovered',true))
    on conflict (project_id,source_type,source_id,target_type,target_id,relationship)
    do update set metadata=governance.lineage_edges.metadata||jsonb_build_object('auto_discovered',true,'refreshed_at',now());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_dataset_lineage on catalog.datasets;
create trigger trg_dataset_lineage after insert or update of data_source_id on catalog.datasets
for each row execute function governance.record_lineage_for_dataset();

create or replace function governance.record_lineage_for_dataset_version()
returns trigger language plpgsql security definer set search_path=pg_catalog,governance,catalog as $$
declare v_project uuid;
begin
  select project_id into v_project from catalog.datasets where id=new.dataset_id;
  if v_project is not null then
    insert into governance.lineage_edges(project_id,source_type,source_id,target_type,target_id,relationship,metadata)
    values(v_project,'DATASET',new.dataset_id,'DATASET_VERSION',new.id,'VERSIONED_AS',jsonb_build_object('version_number',new.version_number,'auto_discovered',true))
    on conflict (project_id,source_type,source_id,target_type,target_id,relationship)
    do update set metadata=excluded.metadata||jsonb_build_object('refreshed_at',now());
  end if;
  return new;
end;
$$;
drop trigger if exists trg_dataset_version_lineage on catalog.dataset_versions;
create trigger trg_dataset_version_lineage after insert on catalog.dataset_versions
for each row execute function governance.record_lineage_for_dataset_version();

create or replace function governance.record_lineage_for_profile_run()
returns trigger language plpgsql security definer set search_path=pg_catalog,governance,catalog,profiling as $$
declare v_dataset uuid; v_project uuid;
begin
  select dv.dataset_id,d.project_id into v_dataset,v_project
  from catalog.dataset_versions dv join catalog.datasets d on d.id=dv.dataset_id
  where dv.id=new.dataset_version_id;
  if v_project is not null then
    insert into governance.lineage_edges(project_id,source_type,source_id,target_type,target_id,relationship,metadata)
    values(v_project,'DATASET_VERSION',new.dataset_version_id,'PROFILE_RUN',new.id,'PROFILED_AS',jsonb_build_object('status',new.status,'auto_discovered',true))
    on conflict (project_id,source_type,source_id,target_type,target_id,relationship)
    do update set metadata=excluded.metadata||jsonb_build_object('refreshed_at',now());
    if new.agent_run_id is not null then
      insert into governance.lineage_edges(project_id,source_type,source_id,target_type,target_id,relationship,metadata)
      values(v_project,'PROFILE_RUN',new.id,'AGENT_RUN',new.agent_run_id,'EXECUTED_BY',jsonb_build_object('auto_discovered',true))
      on conflict (project_id,source_type,source_id,target_type,target_id,relationship)
      do update set metadata=excluded.metadata||jsonb_build_object('refreshed_at',now());
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_profile_run_lineage on profiling.profile_runs;
create trigger trg_profile_run_lineage after insert or update of agent_run_id,status on profiling.profile_runs
for each row execute function governance.record_lineage_for_profile_run();

create or replace function governance.audit_project_table_change()
returns trigger language plpgsql security definer set search_path=pg_catalog,governance as $$
declare v_row jsonb; v_project uuid; v_entity uuid;
begin
  v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_project:=nullif(v_row->>'project_id','')::uuid;
  v_entity:=nullif(v_row->>'id','')::uuid;
  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(v_project,null,'SYSTEM',tg_table_schema||'.'||tg_table_name||'.'||tg_op,tg_table_name,v_entity,jsonb_build_object('operation',tg_op,'table_schema',tg_table_schema,'table_name',tg_table_name));
  return case when tg_op='DELETE' then old else new end;
end;
$$;

do $$
declare entry record;
begin
  for entry in select * from (values
    ('catalog','datasets'),('catalog','data_sources'),('profiling','quality_rule_definitions'),
    ('profiling','observability_alerts'),('profiling','observability_policies'),('profiling','notification_channels'),
    ('governance','lineage_edges'),('governance','dataset_catalog'),('governance','glossary_terms'),
    ('governance','stewardship_assignments'),('governance','certification_requests'),('governance','issues'),
    ('governance','dataset_classifications'),('governance','classification_policies'),('orchestration','job_schedules')
  ) as v(schema_name,table_name)
  loop
    execute format('drop trigger if exists trg_audit_%I on %I.%I',entry.table_name,entry.schema_name,entry.table_name);
    execute format('create trigger trg_audit_%I after insert or update or delete on %I.%I for each row execute function governance.audit_project_table_change()',entry.table_name,entry.schema_name,entry.table_name);
  end loop;
end $$;

insert into governance.lineage_edges(project_id,source_type,source_id,target_type,target_id,relationship,metadata)
select d.project_id,'DATA_SOURCE',d.data_source_id,'DATASET',d.id,'PROVIDES',jsonb_build_object('auto_discovered',true,'backfilled_at',now())
from catalog.datasets d where d.data_source_id is not null
on conflict (project_id,source_type,source_id,target_type,target_id,relationship) do nothing;

insert into governance.lineage_edges(project_id,source_type,source_id,target_type,target_id,relationship,metadata)
select d.project_id,'DATASET',dv.dataset_id,'DATASET_VERSION',dv.id,'VERSIONED_AS',jsonb_build_object('version_number',dv.version_number,'auto_discovered',true,'backfilled_at',now())
from catalog.dataset_versions dv join catalog.datasets d on d.id=dv.dataset_id
on conflict (project_id,source_type,source_id,target_type,target_id,relationship) do nothing;

insert into governance.lineage_edges(project_id,source_type,source_id,target_type,target_id,relationship,metadata)
select d.project_id,'DATASET_VERSION',pr.dataset_version_id,'PROFILE_RUN',pr.id,'PROFILED_AS',jsonb_build_object('status',pr.status,'auto_discovered',true,'backfilled_at',now())
from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id
on conflict (project_id,source_type,source_id,target_type,target_id,relationship) do nothing;

select pg_notify('pgrst','reload schema');
