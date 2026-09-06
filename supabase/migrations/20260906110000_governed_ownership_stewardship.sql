-- Ownership and stewardship are DataNexus governance state, not source physical metadata.
-- Assignments can target governed datasets or a stable catalog identity without manufacturing a dataset.

alter table governance.stewardship_assignments
  add column if not exists target_type text not null default 'DATASET',
  add column if not exists discovered_asset_id uuid,
  add column if not exists data_source_id uuid,
  add column if not exists catalog_identity_key text,
  add column if not exists target_locator text,
  add column if not exists status text not null default 'ACTIVE',
  add column if not exists origin text not null default 'HUMAN',
  add column if not exists assigned_by uuid,
  add column if not exists assigned_at timestamptz,
  add column if not exists revoked_by uuid,
  add column if not exists revoked_at timestamptz,
  add column if not exists decision_reason text,
  add column if not exists target_state text not null default 'CURRENT',
  add column if not exists subject_state text not null default 'CURRENT',
  add column if not exists last_changed_by uuid,
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

-- Existing rows predate governed assignment evidence. Preserve them as legacy current state.
update governance.stewardship_assignments
set target_type='DATASET',
    status=case when active then 'ACTIVE' else 'REVOKED' end,
    origin='LEGACY',
    assigned_at=coalesce(assigned_at,created_at),
    revoked_at=case when not active then coalesce(revoked_at,created_at) else null end,
    target_state='CURRENT',subject_state='CURRENT',updated_at=now()
where origin='HUMAN' and assigned_by is null;

alter table governance.stewardship_assignments alter column dataset_id drop not null;
alter table governance.stewardship_assignments drop constraint if exists stewardship_assignments_dataset_id_fkey;
alter table governance.stewardship_assignments drop constraint if exists stewardship_assignments_user_id_fkey;
alter table governance.stewardship_assignments drop constraint if exists stewardship_assignments_dataset_id_user_id_role_key;

alter table governance.stewardship_assignments drop constraint if exists stewardship_assignments_target_type_check;
alter table governance.stewardship_assignments add constraint stewardship_assignments_target_type_check
  check (target_type in ('DATASET','CATALOG_ASSET'));
alter table governance.stewardship_assignments drop constraint if exists stewardship_assignments_status_check;
alter table governance.stewardship_assignments add constraint stewardship_assignments_status_check
  check (status in ('PROPOSED','ACTIVE','REVOKED'));
alter table governance.stewardship_assignments drop constraint if exists stewardship_assignments_origin_check;
alter table governance.stewardship_assignments add constraint stewardship_assignments_origin_check
  check (origin in ('HUMAN','IMPORTED','AI_SUGGESTED','LEGACY'));
alter table governance.stewardship_assignments drop constraint if exists stewardship_assignments_target_state_check;
alter table governance.stewardship_assignments add constraint stewardship_assignments_target_state_check
  check (target_state in ('CURRENT','STALE'));
alter table governance.stewardship_assignments drop constraint if exists stewardship_assignments_subject_state_check;
alter table governance.stewardship_assignments add constraint stewardship_assignments_subject_state_check
  check (subject_state in ('CURRENT','INACTIVE'));
alter table governance.stewardship_assignments drop constraint if exists stewardship_assignments_target_shape_check;
alter table governance.stewardship_assignments add constraint stewardship_assignments_target_shape_check
  check (
    (target_type='DATASET' and dataset_id is not null and discovered_asset_id is null and data_source_id is null and catalog_identity_key is null)
    or
    (target_type='CATALOG_ASSET' and dataset_id is null and discovered_asset_id is not null and data_source_id is not null and nullif(btrim(catalog_identity_key),'') is not null)
  );
alter table governance.stewardship_assignments drop constraint if exists stewardship_assignments_ai_non_authoritative_check;
alter table governance.stewardship_assignments add constraint stewardship_assignments_ai_non_authoritative_check
  check (origin <> 'AI_SUGGESTED' or status='PROPOSED');
alter table governance.stewardship_assignments drop constraint if exists stewardship_assignments_revocation_evidence_check;
alter table governance.stewardship_assignments add constraint stewardship_assignments_revocation_evidence_check
  check (status <> 'REVOKED' or revoked_at is not null);

create unique index if not exists stewardship_dataset_live_identity_unique
  on governance.stewardship_assignments(dataset_id,user_id,role)
  where target_type='DATASET' and status in ('PROPOSED','ACTIVE');
create unique index if not exists stewardship_catalog_live_identity_unique
  on governance.stewardship_assignments(data_source_id,catalog_identity_key,user_id,role)
  where target_type='CATALOG_ASSET' and status in ('PROPOSED','ACTIVE');
create unique index if not exists stewardship_dataset_business_owner_unique
  on governance.stewardship_assignments(dataset_id)
  where target_type='DATASET' and role='BUSINESS_OWNER' and status='ACTIVE' and target_state='CURRENT' and subject_state='CURRENT';
create unique index if not exists stewardship_catalog_business_owner_unique
  on governance.stewardship_assignments(data_source_id,catalog_identity_key)
  where target_type='CATALOG_ASSET' and role='BUSINESS_OWNER' and status='ACTIVE' and target_state='CURRENT' and subject_state='CURRENT';
create index if not exists stewardship_catalog_target_idx
  on governance.stewardship_assignments(data_source_id,catalog_identity_key)
  where target_type='CATALOG_ASSET';
create index if not exists stewardship_effective_project_idx
  on governance.stewardship_assignments(project_id,role)
  where active=true;

comment on column governance.stewardship_assignments.active is 'Compatibility projection. True only while assignment status is ACTIVE and both target and subject are current.';
comment on column governance.stewardship_assignments.catalog_identity_key is 'Stable catalog identity used for assignment continuity across physical asset versions and locator changes.';
comment on column governance.stewardship_assignments.origin is 'Authority provenance. AI_SUGGESTED assignments can never become active without a separate human governed action.';

create or replace function governance.enforce_stewardship_assignment_integrity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_project_org uuid;
  v_target_project uuid;
  v_dataset_name text;
  v_asset record;
begin
  new.role:=upper(btrim(new.role));
  new.target_type:=upper(btrim(new.target_type));
  new.status:=upper(btrim(new.status));
  new.origin:=upper(btrim(new.origin));
  new.accountability:=nullif(btrim(coalesce(new.accountability,'')),'');
  new.decision_reason:=nullif(btrim(coalesce(new.decision_reason,'')),'');
  new.updated_at:=now();
  if new.assigned_at is null then new.assigned_at:=coalesce(new.created_at,now()); end if;

  if new.role not in ('BUSINESS_OWNER','TECHNICAL_OWNER','DATA_STEWARD','CUSTODIAN') then
    raise exception 'Unsupported stewardship role %',new.role;
  end if;
  if new.status not in ('PROPOSED','ACTIVE','REVOKED') then raise exception 'Unsupported stewardship status'; end if;
  if new.origin not in ('HUMAN','IMPORTED','AI_SUGGESTED','LEGACY') then raise exception 'Unsupported stewardship origin'; end if;
  if new.origin='AI_SUGGESTED' and new.status<>'PROPOSED' then raise exception 'AI stewardship suggestions cannot become authoritative without human action'; end if;

  select organization_id into v_project_org from app.projects where id=new.project_id;
  if v_project_org is null then raise exception 'Stewardship project not found'; end if;

  if new.target_type='DATASET' then
    select project_id,name into v_target_project,v_dataset_name from catalog.datasets where id=new.dataset_id;
    if v_target_project is null then
      if tg_op='UPDATE' and new.target_state='STALE' then
        new.target_locator:=coalesce(new.target_locator,'Deleted governed dataset');
      else
        raise exception 'Stewardship dataset target not found';
      end if;
    elsif v_target_project<>new.project_id then
      raise exception 'Stewardship dataset target belongs to another project';
    else
      new.target_locator:=v_dataset_name;
      if new.target_state<>'STALE' then new.target_state:='CURRENT'; end if;
    end if;
    new.discovered_asset_id:=null; new.data_source_id:=null; new.catalog_identity_key:=null;
  elsif new.target_type='CATALOG_ASSET' then
    if new.target_state='CURRENT' then
      select da.id,da.source_id,da.identity_key,da.namespace,da.name,ds.project_id
        into v_asset
      from catalog.discovered_assets da
      join catalog.data_sources ds on ds.id=da.source_id
      where da.id=new.discovered_asset_id and da.is_current;
      if v_asset.id is null then raise exception 'Stewardship catalog target must be a current discovered asset'; end if;
      if v_asset.project_id<>new.project_id then raise exception 'Stewardship catalog target belongs to another project'; end if;
      if nullif(v_asset.identity_key,'') is null then raise exception 'Stewardship catalog target requires stable catalog identity evidence'; end if;
      new.data_source_id:=v_asset.source_id;
      new.catalog_identity_key:=v_asset.identity_key;
      new.target_locator:=coalesce(nullif(v_asset.namespace,'')||'.','')||v_asset.name;
    else
      select project_id into v_target_project from catalog.data_sources where id=new.data_source_id;
      if v_target_project is null or v_target_project<>new.project_id then raise exception 'Stale stewardship catalog target source is invalid'; end if;
    end if;
  else
    raise exception 'Unsupported stewardship target type';
  end if;

  if new.status in ('PROPOSED','ACTIVE') then
    if not exists(
      select 1 from app.organization_members om
      where om.organization_id=v_project_org and om.user_id=new.user_id
    ) then
      raise exception 'Stewardship assignee must be a current organization member';
    end if;
    new.subject_state:='CURRENT';
  end if;

  if new.origin='HUMAN' and new.status='ACTIVE' then
    if new.assigned_by is null then raise exception 'Human stewardship assignments require an accountable assigning actor'; end if;
    if not exists(select 1 from app.organization_members om where om.organization_id=v_project_org and om.user_id=new.assigned_by) then
      raise exception 'Stewardship assigning actor must be a current organization member';
    end if;
  end if;

  if tg_op='UPDATE' then
    if old.status='REVOKED' and new.status<>'REVOKED' then raise exception 'Revoked stewardship assignments are historical; create a new assignment instead'; end if;
    if old.user_id is distinct from new.user_id or old.role is distinct from new.role or old.target_type is distinct from new.target_type
       or old.dataset_id is distinct from new.dataset_id or old.data_source_id is distinct from new.data_source_id
       or old.catalog_identity_key is distinct from new.catalog_identity_key then
      if not (old.target_type='CATALOG_ASSET' and new.target_type='CATALOG_ASSET' and old.data_source_id=new.data_source_id and old.catalog_identity_key=new.catalog_identity_key) then
        raise exception 'Stewardship assignment identity is immutable';
      end if;
    end if;
  end if;

  if new.status='REVOKED' then
    new.revoked_at:=coalesce(new.revoked_at,now());
  else
    new.revoked_by:=null; new.revoked_at:=null;
  end if;
  new.active:=(new.status='ACTIVE' and new.target_state='CURRENT' and new.subject_state='CURRENT');
  return new;
end;
$function$;

revoke all on function governance.enforce_stewardship_assignment_integrity() from public,anon,authenticated,service_role;
drop trigger if exists stewardship_assignment_integrity on governance.stewardship_assignments;
create trigger stewardship_assignment_integrity
before insert or update on governance.stewardship_assignments
for each row execute function governance.enforce_stewardship_assignment_integrity();

create table if not exists governance.stewardship_assignment_events (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null,
  project_id uuid not null,
  event_sequence integer not null check(event_sequence>0),
  event_type text not null check(event_type in ('BASELINE','PROPOSED','ASSIGNED','REVOKED','ACCOUNTABILITY_CHANGED','TARGET_STALE','TARGET_REFRESHED','SUBJECT_INACTIVE','SUBJECT_RESTORED','CHANGED')),
  target_type text not null,
  dataset_id uuid,
  data_source_id uuid,
  catalog_identity_key text,
  discovered_asset_id uuid,
  target_locator text,
  user_id uuid not null,
  role text not null,
  accountability text,
  assignment_status text not null,
  origin text not null,
  target_state text not null,
  subject_state text not null,
  actor_user_id uuid,
  reason text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(assignment_id,event_sequence)
);
create index if not exists stewardship_assignment_events_project_recent_idx
  on governance.stewardship_assignment_events(project_id,created_at desc);
create index if not exists stewardship_assignment_events_assignment_idx
  on governance.stewardship_assignment_events(assignment_id,event_sequence desc);
alter table governance.stewardship_assignment_events enable row level security;
drop policy if exists stewardship_assignment_events_select on governance.stewardship_assignment_events;
create policy stewardship_assignment_events_select on governance.stewardship_assignment_events
  for select to authenticated using(app_private.is_project_member(project_id));
revoke all on governance.stewardship_assignment_events from anon,authenticated,service_role;
grant select on governance.stewardship_assignment_events to authenticated,service_role;

drop trigger if exists stewardship_assignment_events_append_only on governance.stewardship_assignment_events;
create trigger stewardship_assignment_events_append_only
before update or delete on governance.stewardship_assignment_events
for each row execute function governance.reject_append_only_mutation();

insert into governance.stewardship_assignment_events(
  assignment_id,project_id,event_sequence,event_type,target_type,dataset_id,data_source_id,catalog_identity_key,
  discovered_asset_id,target_locator,user_id,role,accountability,assignment_status,origin,target_state,subject_state,
  actor_user_id,reason,evidence,created_at
)
select sa.id,sa.project_id,1,'BASELINE',sa.target_type,sa.dataset_id,sa.data_source_id,sa.catalog_identity_key,
       sa.discovered_asset_id,sa.target_locator,sa.user_id,sa.role,sa.accountability,sa.status,sa.origin,sa.target_state,sa.subject_state,
       coalesce(sa.assigned_by,sa.last_changed_by),sa.decision_reason,coalesce(sa.evidence,'{}'::jsonb)||jsonb_build_object('baseline',true),sa.created_at
from governance.stewardship_assignments sa
where not exists(select 1 from governance.stewardship_assignment_events e where e.assignment_id=sa.id);

create or replace function governance.capture_stewardship_assignment_evidence()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_next integer;
  v_event text;
  v_actor uuid;
  v_audit_event text;
begin
  if tg_op='UPDATE'
     and old.status is not distinct from new.status
     and old.accountability is not distinct from new.accountability
     and old.target_state is not distinct from new.target_state
     and old.subject_state is not distinct from new.subject_state
     and old.discovered_asset_id is not distinct from new.discovered_asset_id
     and old.evidence is not distinct from new.evidence then
    return new;
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text,0));
  select coalesce(max(event_sequence),0)+1 into v_next from governance.stewardship_assignment_events where assignment_id=new.id;

  if tg_op='INSERT' then
    v_event:=case when new.status='PROPOSED' then 'PROPOSED' else 'ASSIGNED' end;
    v_actor:=new.assigned_by;
  elsif old.status is distinct from new.status and new.status='REVOKED' then
    v_event:='REVOKED'; v_actor:=coalesce(new.revoked_by,new.last_changed_by);
  elsif old.subject_state is distinct from new.subject_state then
    v_event:=case when new.subject_state='INACTIVE' then 'SUBJECT_INACTIVE' else 'SUBJECT_RESTORED' end; v_actor:=null;
  elsif old.target_state is distinct from new.target_state then
    v_event:=case when new.target_state='STALE' then 'TARGET_STALE' else 'TARGET_REFRESHED' end; v_actor:=null;
  elsif old.discovered_asset_id is distinct from new.discovered_asset_id then
    v_event:='TARGET_REFRESHED'; v_actor:=null;
  elsif old.accountability is distinct from new.accountability then
    v_event:='ACCOUNTABILITY_CHANGED'; v_actor:=new.last_changed_by;
  else
    v_event:='CHANGED'; v_actor:=new.last_changed_by;
  end if;

  insert into governance.stewardship_assignment_events(
    assignment_id,project_id,event_sequence,event_type,target_type,dataset_id,data_source_id,catalog_identity_key,
    discovered_asset_id,target_locator,user_id,role,accountability,assignment_status,origin,target_state,subject_state,
    actor_user_id,reason,evidence
  ) values(
    new.id,new.project_id,v_next,v_event,new.target_type,new.dataset_id,new.data_source_id,new.catalog_identity_key,
    new.discovered_asset_id,new.target_locator,new.user_id,new.role,new.accountability,new.status,new.origin,new.target_state,new.subject_state,
    v_actor,new.decision_reason,coalesce(new.evidence,'{}'::jsonb)
  );

  v_audit_event:=case v_event
    when 'PROPOSED' then 'STEWARDSHIP_PROPOSED'
    when 'ASSIGNED' then 'STEWARDSHIP_ASSIGNED'
    when 'REVOKED' then 'STEWARDSHIP_REVOKED'
    when 'ACCOUNTABILITY_CHANGED' then 'STEWARDSHIP_ACCOUNTABILITY_CHANGED'
    when 'TARGET_STALE' then 'STEWARDSHIP_TARGET_STALE'
    when 'TARGET_REFRESHED' then 'STEWARDSHIP_TARGET_REFRESHED'
    when 'SUBJECT_INACTIVE' then 'STEWARDSHIP_SUBJECT_INACTIVE'
    when 'SUBJECT_RESTORED' then 'STEWARDSHIP_SUBJECT_RESTORED'
    else 'STEWARDSHIP_CHANGED' end;
  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(new.project_id,v_actor,case when v_actor is null then 'SYSTEM' else 'USER' end,v_audit_event,'STEWARDSHIP_ASSIGNMENT',new.id,
         jsonb_build_object('event_sequence',v_next,'role',new.role,'target_type',new.target_type,'assignment_status',new.status,
                            'target_state',new.target_state,'subject_state',new.subject_state));
  return new;
end;
$function$;

revoke all on function governance.capture_stewardship_assignment_evidence() from public,anon,authenticated,service_role;
drop trigger if exists trg_audit_stewardship_assignments on governance.stewardship_assignments;
drop trigger if exists stewardship_assignment_evidence_capture on governance.stewardship_assignments;
create trigger stewardship_assignment_evidence_capture
after insert or update of status,accountability,target_state,subject_state,discovered_asset_id,evidence
on governance.stewardship_assignments
for each row execute function governance.capture_stewardship_assignment_evidence();

create or replace function governance.reject_stewardship_assignment_delete()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  raise exception using errcode='55000',message='Stewardship assignments are governed history and cannot be hard-deleted. Revoke the assignment instead.';
end;
$function$;
revoke all on function governance.reject_stewardship_assignment_delete() from public,anon,authenticated,service_role;
drop trigger if exists stewardship_assignment_no_delete on governance.stewardship_assignments;
create trigger stewardship_assignment_no_delete before delete on governance.stewardship_assignments
for each row execute function governance.reject_stewardship_assignment_delete();

create or replace function governance.on_stewardship_change()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','governance'
as $function$
declare v_dataset uuid:=coalesce(new.dataset_id,old.dataset_id); v_required integer;
begin
  if coalesce(new.target_type,old.target_type)<>'DATASET' or v_dataset is null then return coalesce(new,old); end if;
  select count(*) into v_required from governance.stewardship_assignments
  where dataset_id=v_dataset and target_type='DATASET' and active=true and role in ('BUSINESS_OWNER','DATA_STEWARD');
  if v_required=0 then
    perform governance.invalidate_dataset_certification(v_dataset,'STEWARDSHIP_GAP',jsonb_build_object('dataset_id',v_dataset));
  end if;
  return coalesce(new,old);
end;
$function$;
drop trigger if exists governance_stewardship_change on governance.stewardship_assignments;
create trigger governance_stewardship_change
after update of status,target_state,subject_state on governance.stewardship_assignments
for each row execute function governance.on_stewardship_change();

-- A catalog revision may replace a physical version row. Continuity follows catalog_identity_key.
create or replace function governance.refresh_stewardship_catalog_validity(p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare v_current integer:=0; v_stale integer:=0;
begin
  if p_source_id is null then raise exception 'source id is required'; end if;

  update governance.stewardship_assignments sa
     set target_state='STALE',last_changed_by=null,updated_at=now()
   where sa.target_type='CATALOG_ASSET' and sa.data_source_id=p_source_id and sa.status<>'REVOKED'
     and sa.target_state<>'STALE'
     and not exists(select 1 from catalog.discovered_assets da where da.source_id=p_source_id and da.identity_key=sa.catalog_identity_key and da.is_current);

  update governance.stewardship_assignments sa
     set discovered_asset_id=da.id,
         target_locator=coalesce(nullif(da.namespace,'')||'.','')||da.name,
         target_state='CURRENT',last_changed_by=null,updated_at=now()
  from catalog.discovered_assets da
  where sa.target_type='CATALOG_ASSET' and sa.data_source_id=p_source_id and sa.status<>'REVOKED'
    and da.source_id=p_source_id and da.identity_key=sa.catalog_identity_key and da.is_current
    and (sa.discovered_asset_id is distinct from da.id or sa.target_state<>'CURRENT' or sa.target_locator is distinct from coalesce(nullif(da.namespace,'')||'.','')||da.name);

  select count(*) filter(where target_state='CURRENT'),count(*) filter(where target_state='STALE') into v_current,v_stale
  from governance.stewardship_assignments where target_type='CATALOG_ASSET' and data_source_id=p_source_id and status<>'REVOKED';
  return jsonb_build_object('source_id',p_source_id,'current',v_current,'stale',v_stale);
end;
$function$;
revoke all on function governance.refresh_stewardship_catalog_validity(uuid) from public,anon,authenticated;
grant execute on function governance.refresh_stewardship_catalog_validity(uuid) to service_role;

create or replace function governance.on_catalog_revision_refresh_stewardship()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  begin
    perform governance.refresh_stewardship_catalog_validity(new.source_id);
  exception when others then
    raise warning 'Stewardship target validity refresh failed for catalog revision %: %',new.id,sqlerrm;
  end;
  return new;
end;
$function$;
drop trigger if exists catalog_revision_refresh_stewardship on catalog.catalog_revisions;
create trigger catalog_revision_refresh_stewardship
after update of change_set_hash on catalog.catalog_revisions
for each row when(old.change_set_hash is distinct from new.change_set_hash)
execute function governance.on_catalog_revision_refresh_stewardship();

-- User deprovisioning changes effective accountability but never destroys assignment history.
create or replace function governance.on_organization_membership_stewardship()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare v_org uuid:=coalesce(new.organization_id,old.organization_id); v_user uuid:=coalesce(new.user_id,old.user_id);
begin
  if tg_op='DELETE' then
    update governance.stewardship_assignments sa
       set subject_state='INACTIVE',last_changed_by=null,updated_at=now()
     where sa.user_id=v_user and sa.status<>'REVOKED' and sa.subject_state<>'INACTIVE'
       and exists(select 1 from app.projects p where p.id=sa.project_id and p.organization_id=v_org);
    return old;
  end if;
  update governance.stewardship_assignments sa
     set subject_state='CURRENT',last_changed_by=null,updated_at=now()
   where sa.user_id=v_user and sa.status<>'REVOKED' and sa.subject_state<>'CURRENT'
     and exists(select 1 from app.projects p where p.id=sa.project_id and p.organization_id=v_org);
  return new;
end;
$function$;
revoke all on function governance.on_organization_membership_stewardship() from public,anon,authenticated,service_role;
drop trigger if exists organization_membership_refresh_stewardship on app.organization_members;
create trigger organization_membership_refresh_stewardship
after insert or delete on app.organization_members
for each row execute function governance.on_organization_membership_stewardship();

-- Dataset retirement is evidence, not a reason to erase governance history.
create or replace function governance.on_dataset_delete_stewardship()
returns trigger language plpgsql security definer set search_path to '' as $function$
begin
  update governance.stewardship_assignments
     set target_state='STALE',last_changed_by=null,updated_at=now()
   where target_type='DATASET' and dataset_id=old.id and status<>'REVOKED' and target_state<>'STALE';
  return old;
end;
$function$;
revoke all on function governance.on_dataset_delete_stewardship() from public,anon,authenticated,service_role;
drop trigger if exists dataset_delete_refresh_stewardship on catalog.datasets;
create trigger dataset_delete_refresh_stewardship before delete on catalog.datasets
for each row execute function governance.on_dataset_delete_stewardship();

create or replace view governance.current_stewardship_assignments
with (security_invoker=true)
as
select sa.*,
       case when sa.target_type='DATASET' then d.name else coalesce(sa.target_locator,da.asset_key) end as target_name,
       (sa.status='ACTIVE' and sa.target_state='CURRENT' and sa.subject_state='CURRENT' and sa.active) as effective
from governance.stewardship_assignments sa
left join catalog.datasets d on sa.target_type='DATASET' and d.id=sa.dataset_id
left join catalog.discovered_assets da on sa.target_type='CATALOG_ASSET' and da.id=sa.discovered_asset_id
where sa.status<>'REVOKED';

grant select on governance.current_stewardship_assignments to authenticated,service_role;

create or replace view governance.stewardship_dataset_coverage
with (security_invoker=true)
as
select d.project_id,d.id as dataset_id,d.name,
       count(sa.id) filter(where sa.active and sa.role='BUSINESS_OWNER') as business_owner_count,
       count(sa.id) filter(where sa.active and sa.role='DATA_STEWARD') as data_steward_count,
       count(sa.id) filter(where sa.active and sa.role='TECHNICAL_OWNER') as technical_owner_count,
       count(sa.id) filter(where sa.active and sa.role='CUSTODIAN') as custodian_count,
       case
         when count(sa.id) filter(where sa.active and sa.role='BUSINESS_OWNER')>0 and count(sa.id) filter(where sa.active and sa.role='DATA_STEWARD')>0 then 'ACCOUNTABLE'
         when count(sa.id) filter(where sa.active)>0 then 'PARTIAL'
         else 'UNASSIGNED'
       end as coverage_status
from catalog.datasets d
left join governance.stewardship_assignments sa on sa.target_type='DATASET' and sa.dataset_id=d.id and sa.status='ACTIVE'
group by d.project_id,d.id,d.name;
grant select on governance.stewardship_dataset_coverage to authenticated,service_role;

create or replace view governance.stewardship_catalog_coverage
with (security_invoker=true)
as
with targets as (
  select distinct project_id,data_source_id,catalog_identity_key from governance.stewardship_assignments where target_type='CATALOG_ASSET'
  union
  select distinct project_id,source_id,identity_key from catalog.asset_promotion_requests where status in ('REQUESTED','APPROVED')
)
select t.project_id,t.data_source_id,t.catalog_identity_key,
       coalesce(da.asset_key,t.catalog_identity_key) as target_name,
       count(sa.id) filter(where sa.active and sa.role='BUSINESS_OWNER') as business_owner_count,
       count(sa.id) filter(where sa.active and sa.role='DATA_STEWARD') as data_steward_count,
       count(sa.id) filter(where sa.active and sa.role='TECHNICAL_OWNER') as technical_owner_count,
       count(sa.id) filter(where sa.active and sa.role='CUSTODIAN') as custodian_count,
       case
         when count(sa.id) filter(where sa.active and sa.role='BUSINESS_OWNER')>0 and count(sa.id) filter(where sa.active and sa.role='DATA_STEWARD')>0 then 'ACCOUNTABLE'
         when count(sa.id) filter(where sa.active)>0 then 'PARTIAL'
         else 'UNASSIGNED'
       end as coverage_status
from targets t
left join catalog.discovered_assets da on da.source_id=t.data_source_id and da.identity_key=t.catalog_identity_key and da.is_current
left join governance.stewardship_assignments sa on sa.target_type='CATALOG_ASSET' and sa.data_source_id=t.data_source_id and sa.catalog_identity_key=t.catalog_identity_key and sa.status='ACTIVE'
group by t.project_id,t.data_source_id,t.catalog_identity_key,da.asset_key;
grant select on governance.stewardship_catalog_coverage to authenticated,service_role;

-- Current-state writes are only through governed server APIs/RPC context. Members read through RLS.
revoke insert,update,delete on governance.stewardship_assignments from authenticated;
grant select on governance.stewardship_assignments to authenticated;
revoke delete on governance.stewardship_assignments from service_role;

drop policy if exists stewardship_project_access on governance.stewardship_assignments;
drop policy if exists stewardship_assignments_select on governance.stewardship_assignments;
create policy stewardship_assignments_select on governance.stewardship_assignments
  for select to authenticated using(app_private.is_project_member(project_id));

create or replace function governance.verify_stewardship_governance_posture()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_event_append boolean;
  v_capture boolean;
  v_catalog_refresh boolean;
  v_member_refresh boolean;
  v_authenticated_write boolean;
begin
  select exists(select 1 from pg_trigger where tgrelid='governance.stewardship_assignment_events'::regclass and tgname='stewardship_assignment_events_append_only' and not tgisinternal and tgenabled<>'D') into v_event_append;
  select exists(select 1 from pg_trigger where tgrelid='governance.stewardship_assignments'::regclass and tgname='stewardship_assignment_evidence_capture' and not tgisinternal and tgenabled<>'D') into v_capture;
  select exists(select 1 from pg_trigger where tgrelid='catalog.catalog_revisions'::regclass and tgname='catalog_revision_refresh_stewardship' and not tgisinternal and tgenabled<>'D') into v_catalog_refresh;
  select exists(select 1 from pg_trigger where tgrelid='app.organization_members'::regclass and tgname='organization_membership_refresh_stewardship' and not tgisinternal and tgenabled<>'D') into v_member_refresh;
  v_authenticated_write:=has_table_privilege('authenticated','governance.stewardship_assignments','INSERT')
    or has_table_privilege('authenticated','governance.stewardship_assignments','UPDATE')
    or has_table_privilege('authenticated','governance.stewardship_assignments','DELETE');
  return jsonb_build_object(
    'valid',v_event_append and v_capture and v_catalog_refresh and v_member_refresh and not v_authenticated_write,
    'assignment_events_append_only',v_event_append,
    'transactional_evidence_capture',v_capture,
    'catalog_identity_refresh',v_catalog_refresh,
    'membership_lifecycle_refresh',v_member_refresh,
    'authenticated_direct_write',v_authenticated_write
  );
end;
$function$;
revoke all on function governance.verify_stewardship_governance_posture() from public,anon,authenticated;
grant execute on function governance.verify_stewardship_governance_posture() to service_role;

comment on table governance.stewardship_assignments is 'Authoritative DataNexus ownership/stewardship state. Source-native owner metadata remains source evidence and is never overwritten.';
comment on table governance.stewardship_assignment_events is 'Append-only evidence for assignment, revocation, target continuity, subject lifecycle and accountability changes.';
