alter table governance.audit_events add column if not exists previous_hash text;
alter table governance.audit_events add column if not exists event_hash text;

create or replace function governance.compute_audit_event_hash(
  p_previous_hash text,
  p_id uuid,
  p_project_id uuid,
  p_actor_user_id uuid,
  p_actor_type text,
  p_event_type text,
  p_entity_type text,
  p_entity_id uuid,
  p_correlation_id uuid,
  p_metadata jsonb,
  p_created_at timestamptz
) returns text
language sql
immutable
set search_path=pg_catalog,extensions
as $$
  select encode(extensions.digest(
    concat_ws('|',
      coalesce(p_previous_hash,''),
      p_id::text,
      coalesce(p_project_id::text,''),
      coalesce(p_actor_user_id::text,''),
      coalesce(p_actor_type,''),
      coalesce(p_event_type,''),
      coalesce(p_entity_type,''),
      coalesce(p_entity_id::text,''),
      coalesce(p_correlation_id::text,''),
      coalesce(p_metadata,'{}'::jsonb)::text,
      p_created_at::text
    ),
    'sha256'
  ),'hex');
$$;
revoke execute on function governance.compute_audit_event_hash(text,uuid,uuid,uuid,text,text,text,uuid,uuid,jsonb,timestamptz) from public,anon,authenticated;
grant execute on function governance.compute_audit_event_hash(text,uuid,uuid,uuid,text,text,text,uuid,uuid,jsonb,timestamptz) to service_role;

do $$
declare
  r record;
  v_project_marker text:=null;
  v_prev text:=null;
  v_hash text;
begin
  for r in
    select id,project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,correlation_id,metadata,created_at
    from governance.audit_events
    order by coalesce(project_id::text,''),created_at,id
  loop
    if v_project_marker is distinct from coalesce(r.project_id::text,'') then
      v_project_marker:=coalesce(r.project_id::text,'');
      v_prev:=null;
    end if;
    v_hash:=governance.compute_audit_event_hash(v_prev,r.id,r.project_id,r.actor_user_id,r.actor_type,r.event_type,r.entity_type,r.entity_id,r.correlation_id,r.metadata,r.created_at);
    update governance.audit_events set previous_hash=v_prev,event_hash=v_hash where id=r.id;
    v_prev:=v_hash;
  end loop;
end $$;

create or replace function governance.prepare_audit_event_hash()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog,governance
as $$
declare v_prev text;
begin
  perform pg_advisory_xact_lock(hashtextextended(coalesce(new.project_id::text,'GLOBAL'),0));
  select event_hash into v_prev
  from governance.audit_events
  where project_id is not distinct from new.project_id
    and event_hash is not null
  order by created_at desc,id desc
  limit 1;
  new.previous_hash:=v_prev;
  new.event_hash:=governance.compute_audit_event_hash(v_prev,new.id,new.project_id,new.actor_user_id,new.actor_type,new.event_type,new.entity_type,new.entity_id,new.correlation_id,new.metadata,new.created_at);
  return new;
end;
$$;

create or replace function governance.reject_append_only_mutation()
returns trigger
language plpgsql
security definer
set search_path=pg_catalog
as $$
begin
  raise exception '% is append-only and cannot be updated or deleted',tg_table_schema||'.'||tg_table_name using errcode='55000';
end;
$$;

revoke execute on function governance.prepare_audit_event_hash() from public,anon,authenticated;
revoke execute on function governance.reject_append_only_mutation() from public,anon,authenticated;
grant execute on function governance.prepare_audit_event_hash(),governance.reject_append_only_mutation() to service_role;

drop trigger if exists audit_events_hash_chain on governance.audit_events;
create trigger audit_events_hash_chain before insert on governance.audit_events for each row execute function governance.prepare_audit_event_hash();
drop trigger if exists audit_events_append_only on governance.audit_events;
create trigger audit_events_append_only before update or delete on governance.audit_events for each row execute function governance.reject_append_only_mutation();
drop trigger if exists object_revisions_append_only on governance.object_revisions;
create trigger object_revisions_append_only before update or delete on governance.object_revisions for each row execute function governance.reject_append_only_mutation();

alter table governance.audit_events alter column event_hash set not null;
create index if not exists audit_events_project_chain_idx on governance.audit_events(project_id,created_at,id);
create unique index if not exists audit_events_event_hash_unique on governance.audit_events(event_hash);

revoke all on governance.audit_events from anon,authenticated;
grant select on governance.audit_events to authenticated;
revoke update,delete,truncate on governance.audit_events from service_role;
grant select,insert on governance.audit_events to service_role;

revoke all on governance.object_revisions from anon,authenticated;
grant select on governance.object_revisions to authenticated;
revoke update,delete,truncate on governance.object_revisions from service_role;
grant select,insert on governance.object_revisions to service_role;

create or replace function governance.verify_audit_chain(p_project_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,governance
as $$
declare
  r record;
  v_project_marker text:=null;
  v_prev text:=null;
  v_expected text;
  v_checked integer:=0;
  v_failures integer:=0;
begin
  for r in
    select id,project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,correlation_id,metadata,created_at,previous_hash,event_hash
    from governance.audit_events
    where p_project_id is null or project_id=p_project_id
    order by coalesce(project_id::text,''),created_at,id
  loop
    if v_project_marker is distinct from coalesce(r.project_id::text,'') then
      v_project_marker:=coalesce(r.project_id::text,'');
      v_prev:=null;
    end if;
    v_expected:=governance.compute_audit_event_hash(v_prev,r.id,r.project_id,r.actor_user_id,r.actor_type,r.event_type,r.entity_type,r.entity_id,r.correlation_id,r.metadata,r.created_at);
    v_checked:=v_checked+1;
    if r.previous_hash is distinct from v_prev or r.event_hash is distinct from v_expected then v_failures:=v_failures+1; end if;
    v_prev:=r.event_hash;
  end loop;
  return jsonb_build_object('valid',v_failures=0,'events_checked',v_checked,'failures',v_failures,'verified_at',now());
end;
$$;
revoke execute on function governance.verify_audit_chain(uuid) from public,anon,authenticated;
grant execute on function governance.verify_audit_chain(uuid) to service_role;

select pg_notify('pgrst','reload schema');
