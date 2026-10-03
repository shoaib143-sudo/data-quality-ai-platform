begin;

create table if not exists governance.dataset_catalog_history (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  change_type text not null check (change_type in ('BASELINE','INSERT','UPDATE','ROLLBACK')),
  snapshot jsonb not null,
  created_at timestamptz not null default now(),
  unique(dataset_id,version_number)
);

create index if not exists dataset_catalog_history_project_idx
  on governance.dataset_catalog_history(project_id,created_at desc);
create index if not exists dataset_catalog_history_dataset_idx
  on governance.dataset_catalog_history(dataset_id,version_number desc);

insert into governance.dataset_catalog_history(dataset_id,project_id,version_number,change_type,snapshot,created_at)
select dc.dataset_id,dc.project_id,1,'BASELINE',to_jsonb(dc),coalesce(dc.updated_at,now())
from governance.dataset_catalog dc
where not exists(select 1 from governance.dataset_catalog_history h where h.dataset_id=dc.dataset_id);

create or replace function governance.capture_dataset_catalog_history()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_next integer;
  v_change text;
begin
  select coalesce(max(version_number),0)+1 into v_next
  from governance.dataset_catalog_history
  where dataset_id=new.dataset_id;

  v_change:=case when tg_op='INSERT' then 'INSERT'
                 when coalesce(current_setting('datanexus.catalog_rollback',true),'')='true' then 'ROLLBACK'
                 else 'UPDATE' end;

  insert into governance.dataset_catalog_history(dataset_id,project_id,version_number,change_type,snapshot)
  values(new.dataset_id,new.project_id,v_next,v_change,to_jsonb(new));

  return new;
end;
$$;

drop trigger if exists dataset_catalog_version_history on governance.dataset_catalog;
create trigger dataset_catalog_version_history
after insert or update on governance.dataset_catalog
for each row execute function governance.capture_dataset_catalog_history();

create or replace function governance.restore_dataset_catalog_history(p_history_id uuid,p_actor uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_history governance.dataset_catalog_history%rowtype;
  v_restore governance.dataset_catalog%rowtype;
  v_current governance.dataset_catalog%rowtype;
begin
  if p_actor is null then raise exception 'An accountable actor is required'; end if;

  select * into v_history
  from governance.dataset_catalog_history
  where id=p_history_id;

  if not found then raise exception 'Catalog metadata history version not found'; end if;
  if not governance.has_project_capability(v_history.project_id,p_actor,'catalog.update') then
    raise exception 'Actor is not authorized for catalog.update in this project';
  end if;

  select * into v_restore
  from jsonb_populate_record(null::governance.dataset_catalog,v_history.snapshot);

  perform set_config('datanexus.catalog_rollback','true',true);

  update governance.dataset_catalog
  set technical_owner_user_id=v_restore.technical_owner_user_id,
      business_owner_user_id=v_restore.business_owner_user_id,
      steward_user_id=v_restore.steward_user_id,
      lifecycle_status=v_restore.lifecycle_status,
      criticality=v_restore.criticality,
      tags=v_restore.tags,
      business_description=v_restore.business_description,
      retention_days=v_restore.retention_days,
      metadata=coalesce(v_restore.metadata,'{}'::jsonb),
      updated_at=now()
  where dataset_id=v_history.dataset_id
  returning * into v_current;

  if not found then raise exception 'Current catalog metadata record not found'; end if;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(v_history.project_id,p_actor,'USER','CATALOG_METADATA_ROLLED_BACK','DATASET',v_history.dataset_id,
    jsonb_build_object(
      'restored_history_id',v_history.id,
      'restored_version_number',v_history.version_number,
      'certification_state_preserved',true,
      'rollback_creates_new_version',true
    ));

  return to_jsonb(v_current)||jsonb_build_object(
    'restored_history_id',v_history.id,
    'restored_version_number',v_history.version_number,
    'certification_state_preserved',true
  );
end;
$$;

alter table governance.dataset_catalog_history enable row level security;
drop policy if exists dataset_catalog_history_select on governance.dataset_catalog_history;
create policy dataset_catalog_history_select on governance.dataset_catalog_history
for select to authenticated
using(app_private.is_project_member(project_id));

grant select on governance.dataset_catalog_history to authenticated;
grant all on governance.dataset_catalog_history to service_role;
revoke all on function governance.capture_dataset_catalog_history() from public,anon,authenticated;
revoke all on function governance.restore_dataset_catalog_history(uuid,uuid) from public,anon,authenticated;
grant execute on function governance.restore_dataset_catalog_history(uuid,uuid) to service_role;

select pg_notify('pgrst','reload schema');
commit;
