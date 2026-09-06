-- Govern classification/privacy against stable dataset or catalog identity without promoting observations or AI suggestions to authority.

alter table governance.classification_labels
  add column if not exists sensitivity_level smallint,
  add column if not exists privacy_category text,
  add column if not exists protection_intent jsonb not null default '{}'::jsonb;

update governance.classification_labels
set sensitivity_level = coalesce(sensitivity_level, case upper(code)
  when 'RESTRICTED' then 5 when 'PHI' then 5 when 'PCI' then 5
  when 'PII' then 4 when 'CONFIDENTIAL' then 4 when 'INTERNAL' then 2 else 3 end),
    privacy_category = coalesce(privacy_category, case when upper(category) in ('PII','PHI','PCI') then upper(category) else 'GENERAL' end),
    protection_intent = coalesce(protection_intent,'{}'::jsonb) || jsonb_build_object(
      'declarative_only', true,
      'external_enforcement_required', true
    )
where sensitivity_level is null or privacy_category is null or protection_intent='{}'::jsonb;

alter table governance.classification_labels drop constraint if exists classification_labels_sensitivity_level_check;
alter table governance.classification_labels add constraint classification_labels_sensitivity_level_check
  check (sensitivity_level between 1 and 5);

alter table governance.dataset_classifications
  alter column dataset_id drop not null,
  add column if not exists target_type text not null default 'DATASET',
  add column if not exists data_source_id uuid,
  add column if not exists catalog_identity_key text,
  add column if not exists discovered_asset_id uuid,
  add column if not exists target_locator text,
  add column if not exists target_state text not null default 'CURRENT',
  add column if not exists origin text not null default 'AI_SUGGESTED',
  add column if not exists authority_state text not null default 'PROPOSED',
  add column if not exists catalog_revision_id uuid;

update governance.dataset_classifications
set target_type='DATASET',
    target_state='CURRENT',
    origin=case
      when status='APPROVED' then 'HUMAN_APPROVED'
      when upper(coalesce(source,'')) in ('SOURCE','SOURCE_OBSERVED','CONNECTOR') then 'SOURCE_OBSERVED'
      when upper(coalesce(source,'')) in ('POLICY','POLICY_DERIVED') then 'POLICY_DERIVED'
      else 'AI_SUGGESTED' end,
    authority_state=case status when 'APPROVED' then 'AUTHORITATIVE' when 'REJECTED' then 'REJECTED' else 'PROPOSED' end
where target_type is distinct from 'DATASET'
   or origin not in ('SOURCE_OBSERVED','AI_SUGGESTED','HUMAN_APPROVED','POLICY_DERIVED')
   or authority_state not in ('OBSERVED_ONLY','PROPOSED','AUTHORITATIVE','REJECTED');

alter table governance.dataset_classifications drop constraint if exists dataset_classifications_target_check;
alter table governance.dataset_classifications add constraint dataset_classifications_target_check check (
  (target_type='DATASET' and dataset_id is not null and data_source_id is null and catalog_identity_key is null)
  or
  (target_type='CATALOG_ASSET' and dataset_id is null and data_source_id is not null and catalog_identity_key is not null)
);
alter table governance.dataset_classifications drop constraint if exists dataset_classifications_target_type_check;
alter table governance.dataset_classifications add constraint dataset_classifications_target_type_check check (target_type in ('DATASET','CATALOG_ASSET'));
alter table governance.dataset_classifications drop constraint if exists dataset_classifications_target_state_check;
alter table governance.dataset_classifications add constraint dataset_classifications_target_state_check check (target_state in ('CURRENT','STALE'));
alter table governance.dataset_classifications drop constraint if exists dataset_classifications_origin_check;
alter table governance.dataset_classifications add constraint dataset_classifications_origin_check check (origin in ('SOURCE_OBSERVED','AI_SUGGESTED','HUMAN_APPROVED','POLICY_DERIVED'));
alter table governance.dataset_classifications drop constraint if exists dataset_classifications_authority_state_check;
alter table governance.dataset_classifications add constraint dataset_classifications_authority_state_check check (authority_state in ('OBSERVED_ONLY','PROPOSED','AUTHORITATIVE','REJECTED'));
alter table governance.dataset_classifications drop constraint if exists dataset_classifications_authority_consistency_check;
alter table governance.dataset_classifications add constraint dataset_classifications_authority_consistency_check check (
  (status='APPROVED' and authority_state='AUTHORITATIVE' and reviewed_by is not null and reviewed_at is not null)
  or (status='REJECTED' and authority_state='REJECTED' and reviewed_by is not null and reviewed_at is not null)
  or (status not in ('APPROVED','REJECTED') and authority_state in ('OBSERVED_ONLY','PROPOSED'))
);

create index if not exists dataset_classifications_catalog_identity_idx
  on governance.dataset_classifications(project_id,data_source_id,catalog_identity_key)
  where target_type='CATALOG_ASSET';
create index if not exists dataset_classifications_authority_idx
  on governance.dataset_classifications(project_id,authority_state,target_state);

create table if not exists governance.classification_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  classification_id uuid not null,
  event_type text not null,
  actor_user_id uuid,
  status text not null,
  authority_state text not null,
  target_state text not null,
  evidence jsonb not null default '{}'::jsonb,
  event_hash text not null,
  created_at timestamptz not null default now()
);
create index if not exists classification_events_classification_idx
  on governance.classification_events(classification_id,created_at,id);
alter table governance.classification_events enable row level security;
drop policy if exists classification_events_project_read on governance.classification_events;
create policy classification_events_project_read on governance.classification_events for select to authenticated
  using (app_private.is_project_member(project_id));
revoke all on governance.classification_events from public,anon,authenticated,service_role;
grant select on governance.classification_events to authenticated,service_role;

create or replace function governance.classification_events_append_only()
returns trigger language plpgsql set search_path='pg_catalog','governance' as $$
begin
  raise exception 'Classification event evidence is append-only';
end; $$;
revoke all on function governance.classification_events_append_only() from public,anon,authenticated,service_role;
drop trigger if exists classification_events_append_only on governance.classification_events;
create trigger classification_events_append_only before update or delete on governance.classification_events
for each row execute function governance.classification_events_append_only();

create or replace function governance.validate_classification_target()
returns trigger language plpgsql set search_path='pg_catalog','governance','catalog' as $$
declare
  v_asset catalog.discovered_assets%rowtype;
  v_field_exists boolean;
begin
  if new.target_type='DATASET' then
    if not exists(select 1 from catalog.datasets d where d.id=new.dataset_id and d.project_id=new.project_id) then
      raise exception 'Classification dataset target is not part of this project';
    end if;
    new.data_source_id:=null; new.catalog_identity_key:=null; new.discovered_asset_id:=null;
    new.target_locator:=coalesce(new.target_locator,new.dataset_id::text); new.target_state:='CURRENT';
  else
    select a.* into v_asset
    from catalog.discovered_assets a join catalog.data_sources s on s.id=a.source_id
    where a.source_id=new.data_source_id and a.identity_key=new.catalog_identity_key and a.is_current and s.project_id=new.project_id
    order by a.version_number desc limit 1;
    if not found then raise exception 'Classification catalog identity is not a current governed asset in this project'; end if;
    if new.column_name is not null then
      select exists(select 1 from jsonb_array_elements(v_asset.columns) f where f->>'name'=new.column_name) into v_field_exists;
      if not v_field_exists then raise exception 'Classification field locator does not exist on the current catalog asset'; end if;
    end if;
    new.discovered_asset_id:=v_asset.id; new.target_locator:=v_asset.asset_key; new.target_state:='CURRENT';
  end if;

  if new.status='SUGGESTED' then
    new.authority_state:=case when new.origin='SOURCE_OBSERVED' then 'OBSERVED_ONLY' else 'PROPOSED' end;
  end if;
  if new.origin in ('SOURCE_OBSERVED','AI_SUGGESTED') and new.status='APPROVED' and
     not (current_user='postgres' and coalesce(current_setting('governance.knowledge_review_context',true),'')='true') then
    raise exception 'Observed or AI suggested classification cannot become authoritative without human review';
  end if;
  return new;
end; $$;
revoke all on function governance.validate_classification_target() from public,anon,authenticated,service_role;
drop trigger if exists trg_validate_classification_target on governance.dataset_classifications;
create trigger trg_validate_classification_target before insert on governance.dataset_classifications
for each row execute function governance.validate_classification_target();

create or replace function governance.protect_classification_identity_history()
returns trigger language plpgsql set search_path='pg_catalog','governance' as $$
begin
  if tg_op='DELETE' then raise exception 'Classification decisions are governed history and cannot be hard-deleted'; end if;
  if new.project_id is distinct from old.project_id or new.target_type is distinct from old.target_type
     or new.dataset_id is distinct from old.dataset_id or new.data_source_id is distinct from old.data_source_id
     or new.catalog_identity_key is distinct from old.catalog_identity_key or new.column_name is distinct from old.column_name
     or new.label_id is distinct from old.label_id or new.origin is distinct from old.origin then
    raise exception 'Classification target, label and origin are immutable; create a new classification record';
  end if;
  return new;
end; $$;
revoke all on function governance.protect_classification_identity_history() from public,anon,authenticated,service_role;
drop trigger if exists trg_protect_classification_identity_history on governance.dataset_classifications;
create trigger trg_protect_classification_identity_history before update or delete on governance.dataset_classifications
for each row execute function governance.protect_classification_identity_history();

create or replace function governance.capture_classification_event()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance' as $$
declare
  v_type text;
  v_actor uuid;
  v_payload jsonb;
begin
  v_type:=case when tg_op='INSERT' then 'PROPOSED'
    when new.status is distinct from old.status then 'REVIEW_DECIDED'
    when new.target_state is distinct from old.target_state then 'TARGET_STATE_CHANGED'
    else 'STATE_REFRESHED' end;
  v_actor:=coalesce(new.reviewed_by,new.approved_by);
  v_payload:=jsonb_build_object('target_type',new.target_type,'dataset_id',new.dataset_id,'data_source_id',new.data_source_id,
    'catalog_identity_key',new.catalog_identity_key,'target_locator',new.target_locator,'column_name',new.column_name,
    'label_id',new.label_id,'origin',new.origin,'source',new.source,'confidence',new.confidence,
    'status',new.status,'authority_state',new.authority_state,'target_state',new.target_state,
    'catalog_revision_id',new.catalog_revision_id,'evidence',new.evidence);
  insert into governance.classification_events(project_id,classification_id,event_type,actor_user_id,status,authority_state,target_state,evidence,event_hash)
  values(new.project_id,new.id,v_type,v_actor,new.status,new.authority_state,new.target_state,v_payload,
    encode(digest(convert_to(v_payload::text,'UTF8'),'sha256'),'hex'));
  return new;
end; $$;
revoke all on function governance.capture_classification_event() from public,anon,authenticated,service_role;
drop trigger if exists trg_capture_classification_event on governance.dataset_classifications;
create trigger trg_capture_classification_event after insert or update of status,authority_state,target_state,discovered_asset_id,target_locator,catalog_revision_id on governance.dataset_classifications
for each row execute function governance.capture_classification_event();

create or replace function governance.propose_classification(
  p_project_id uuid,p_actor uuid,p_label_id uuid,p_target_type text,p_dataset_id uuid default null,
  p_data_source_id uuid default null,p_catalog_identity_key text default null,p_column_name text default null,
  p_origin text default 'HUMAN_APPROVED',p_confidence numeric default null,p_evidence jsonb default '{}'::jsonb
) returns jsonb language plpgsql security definer set search_path='pg_catalog','governance','catalog' as $$
declare v_row governance.dataset_classifications%rowtype; v_origin text:=upper(btrim(coalesce(p_origin,'')));
begin
  if v_origin not in ('SOURCE_OBSERVED','AI_SUGGESTED','HUMAN_APPROVED','POLICY_DERIVED') then raise exception 'Unsupported classification origin'; end if;
  if v_origin='HUMAN_APPROVED' then
    if p_actor is null or not governance.has_project_capability(p_project_id,p_actor,'classification.review') then
      raise exception 'Human classification proposal requires classification.review capability';
    end if;
  end if;
  if not exists(select 1 from governance.classification_labels l where l.id=p_label_id and l.enabled and (l.project_id is null or l.project_id=p_project_id)) then
    raise exception 'Classification label is not available to this project';
  end if;
  insert into governance.dataset_classifications(project_id,dataset_id,column_name,label_id,status,confidence,source,evidence,
    target_type,data_source_id,catalog_identity_key,target_state,origin,authority_state)
  values(p_project_id,p_dataset_id,nullif(btrim(coalesce(p_column_name,'')),''),p_label_id,'SUGGESTED',p_confidence,v_origin,
    coalesce(p_evidence,'{}'::jsonb)||jsonb_build_object('proposed_by',p_actor,'governed_proposal',true),
    upper(btrim(p_target_type)),p_data_source_id,nullif(btrim(coalesce(p_catalog_identity_key,'')),''),'CURRENT',v_origin,
    case when v_origin='SOURCE_OBSERVED' then 'OBSERVED_ONLY' else 'PROPOSED' end)
  returning * into v_row;
  return jsonb_build_object('id',v_row.id,'status',v_row.status,'authority_state',v_row.authority_state,'origin',v_row.origin,
    'target_type',v_row.target_type,'target_state',v_row.target_state,'target_locator',v_row.target_locator);
end; $$;
revoke all on function governance.propose_classification(uuid,uuid,uuid,text,uuid,uuid,text,text,text,numeric,jsonb) from public,anon,authenticated;
grant execute on function governance.propose_classification(uuid,uuid,uuid,text,uuid,uuid,text,text,text,numeric,jsonb) to service_role;

create or replace function governance.review_dataset_classification(
  p_project_id uuid,p_classification_id uuid,p_reviewer uuid,p_decision text,p_comment text default null
) returns jsonb language plpgsql security definer set search_path='pg_catalog','governance' as $$
declare v_previous text; v_decision text:=upper(btrim(coalesce(p_decision,''))); v_result governance.dataset_classifications%rowtype;
begin
  if p_reviewer is null then raise exception 'Classification review requires an accountable reviewer user id'; end if;
  if not governance.has_project_capability(p_project_id,p_reviewer,'classification.review') then raise exception 'Reviewer is not authorized for classification.review in this project'; end if;
  if v_decision not in ('APPROVED','REJECTED') then raise exception 'Classification review decision must be APPROVED or REJECTED'; end if;
  if char_length(coalesce(p_comment,''))>2000 then raise exception 'Classification review comment must be 2000 characters or fewer'; end if;
  select status into v_previous from governance.dataset_classifications where id=p_classification_id and project_id=p_project_id for update;
  if not found then raise exception 'Classification suggestion was not found in this project'; end if;
  if v_previous<>'SUGGESTED' then raise exception 'Only a SUGGESTED classification can receive a final human review decision'; end if;
  perform set_config('governance.knowledge_review_context','true',true);
  update governance.dataset_classifications set status=v_decision,
    authority_state=case when v_decision='APPROVED' then 'AUTHORITATIVE' else 'REJECTED' end,
    approved_by=case when v_decision='APPROVED' then p_reviewer else null end,reviewed_by=p_reviewer,reviewed_at=now(),
    review_comment=nullif(btrim(coalesce(p_comment,'')),''),
    evidence=coalesce(evidence,'{}'::jsonb)||jsonb_build_object('review',jsonb_build_object('previous_status',v_previous,
      'decision',v_decision,'reviewed_by',p_reviewer,'reviewed_at',now(),'comment',nullif(btrim(coalesce(p_comment,'')),''))),updated_at=now()
  where id=p_classification_id and project_id=p_project_id returning * into v_result;
  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(p_project_id,p_reviewer,'USER','GOVERNANCE_KNOWLEDGE_REVIEW_DECIDED','DATASET_CLASSIFICATION',p_classification_id,
    jsonb_build_object('decision',v_decision,'previous_status',v_previous,'human_review',true,'authority_state',v_result.authority_state,
      'origin',v_result.origin,'target_type',v_result.target_type,'catalog_identity_key',v_result.catalog_identity_key,
      'atomic_with_decision',true,'ai_override_prohibited',true));
  return jsonb_build_object('id',v_result.id,'previous_status',v_previous,'status',v_result.status,'authority_state',v_result.authority_state,
    'reviewed_by',v_result.reviewed_by,'reviewed_at',v_result.reviewed_at,'target_state',v_result.target_state,'audit_atomic',true);
end; $$;
revoke all on function governance.review_dataset_classification(uuid,uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function governance.review_dataset_classification(uuid,uuid,uuid,text,text) to service_role;

create or replace function governance.refresh_classification_target_validity(p_source_id uuid default null,p_catalog_revision_id uuid default null)
returns jsonb language plpgsql security definer set search_path='pg_catalog','governance','catalog' as $$
declare r record; v_asset catalog.discovered_assets%rowtype; v_field boolean; v_current int:=0; v_stale int:=0;
begin
  for r in select * from governance.dataset_classifications where target_type='CATALOG_ASSET' and (p_source_id is null or data_source_id=p_source_id) loop
    select a.* into v_asset from catalog.discovered_assets a where a.source_id=r.data_source_id and a.identity_key=r.catalog_identity_key and a.is_current order by a.version_number desc limit 1;
    if found then
      v_field:=true;
      if r.column_name is not null then select exists(select 1 from jsonb_array_elements(v_asset.columns) f where f->>'name'=r.column_name) into v_field; end if;
      if v_field then
        update governance.dataset_classifications set discovered_asset_id=v_asset.id,target_locator=v_asset.asset_key,target_state='CURRENT',
          catalog_revision_id=coalesce(p_catalog_revision_id,catalog_revision_id),updated_at=now()
        where id=r.id and (target_state<>'CURRENT' or discovered_asset_id is distinct from v_asset.id or target_locator is distinct from v_asset.asset_key or (p_catalog_revision_id is not null and catalog_revision_id is distinct from p_catalog_revision_id));
        v_current:=v_current+1;
      else
        update governance.dataset_classifications set target_state='STALE',catalog_revision_id=coalesce(p_catalog_revision_id,catalog_revision_id),updated_at=now()
        where id=r.id and (target_state<>'STALE' or (p_catalog_revision_id is not null and catalog_revision_id is distinct from p_catalog_revision_id));
        v_stale:=v_stale+1;
      end if;
    else
      update governance.dataset_classifications set target_state='STALE',catalog_revision_id=coalesce(p_catalog_revision_id,catalog_revision_id),updated_at=now()
      where id=r.id and (target_state<>'STALE' or (p_catalog_revision_id is not null and catalog_revision_id is distinct from p_catalog_revision_id));
      v_stale:=v_stale+1;
    end if;
  end loop;
  return jsonb_build_object('current',v_current,'stale',v_stale,'source_id',p_source_id,'catalog_revision_id',p_catalog_revision_id);
end; $$;
revoke all on function governance.refresh_classification_target_validity(uuid,uuid) from public,anon,authenticated;
grant execute on function governance.refresh_classification_target_validity(uuid,uuid) to service_role;

create or replace function governance.on_catalog_revision_refresh_classifications()
returns trigger language plpgsql security definer set search_path='pg_catalog','governance','catalog' as $$
begin
  begin perform governance.refresh_classification_target_validity(new.source_id,new.id); exception when others then
    raise warning 'Classification target validity refresh failed after catalog publication: %',sqlerrm;
  end;
  return new;
end; $$;
revoke all on function governance.on_catalog_revision_refresh_classifications() from public,anon,authenticated,service_role;
drop trigger if exists catalog_revision_refresh_classifications on catalog.catalog_revisions;
create trigger catalog_revision_refresh_classifications after update of change_set_hash on catalog.catalog_revisions
for each row when (old.change_set_hash is distinct from new.change_set_hash)
execute function governance.on_catalog_revision_refresh_classifications();

create or replace view governance.classification_catalog_coverage as
select s.project_id,a.source_id,a.identity_key as catalog_identity_key,a.id as discovered_asset_id,a.asset_key,a.namespace,a.name,a.asset_type,
  count(c.id) filter(where c.target_state='CURRENT') as classification_count,
  count(c.id) filter(where c.target_state='CURRENT' and c.authority_state='AUTHORITATIVE') as authoritative_count,
  count(c.id) filter(where c.target_state='CURRENT' and c.authority_state='PROPOSED') as proposed_count,
  count(c.id) filter(where c.target_state='CURRENT' and c.authority_state='OBSERVED_ONLY') as observed_only_count,
  count(c.id) filter(where c.target_state='STALE') as stale_count,
  case when count(c.id) filter(where c.target_state='CURRENT' and c.authority_state='AUTHORITATIVE')>0 then 'GOVERNED'
       when count(c.id) filter(where c.target_state='CURRENT')>0 then 'PENDING_AUTHORITY' else 'UNCLASSIFIED' end as coverage_state
from catalog.discovered_assets a join catalog.data_sources s on s.id=a.source_id
left join governance.dataset_classifications c on c.project_id=s.project_id and c.target_type='CATALOG_ASSET'
  and c.data_source_id=a.source_id and c.catalog_identity_key=a.identity_key
where a.is_current
group by s.project_id,a.source_id,a.identity_key,a.id,a.asset_key,a.namespace,a.name,a.asset_type;

create or replace view governance.classification_dataset_coverage as
select d.project_id,d.id as dataset_id,d.name,
  count(c.id) as classification_count,
  count(c.id) filter(where c.authority_state='AUTHORITATIVE') as authoritative_count,
  count(c.id) filter(where c.authority_state='PROPOSED') as proposed_count,
  count(c.id) filter(where c.authority_state='OBSERVED_ONLY') as observed_only_count,
  case when count(c.id) filter(where c.authority_state='AUTHORITATIVE')>0 then 'GOVERNED'
       when count(c.id)>0 then 'PENDING_AUTHORITY' else 'UNCLASSIFIED' end as coverage_state
from catalog.datasets d left join governance.dataset_classifications c on c.project_id=d.project_id and c.target_type='DATASET' and c.dataset_id=d.id
group by d.project_id,d.id,d.name;

grant select on governance.classification_catalog_coverage,governance.classification_dataset_coverage to authenticated,service_role;

create or replace view governance.privacy_control_hooks as
select c.project_id,c.id as classification_id,c.target_type,c.dataset_id,c.data_source_id,c.catalog_identity_key,c.target_locator,c.column_name,
  l.code as label_code,l.category,l.sensitivity_level,l.privacy_category,l.handling_requirements,
  coalesce(bool_or(p.masking_required),false) or lower(coalesce(l.handling_requirements->>'masking','')) like 'required%' as masking_required,
  coalesce(bool_or(p.encryption_required),false) or lower(coalesce(l.handling_requirements->>'encryption',''))='required' as encryption_required,
  coalesce(max(p.retention_days),null) as retention_days,
  'DECLARATIVE_ONLY'::text as enforcement_state,
  'External access/masking engines remain authoritative for enforcement; this view is governed policy intent.'::text as authority_note
from governance.dataset_classifications c join governance.classification_labels l on l.id=c.label_id
left join governance.classification_policies p on p.project_id=c.project_id and p.label_id=l.id and p.enabled
where c.authority_state='AUTHORITATIVE' and c.target_state='CURRENT'
group by c.project_id,c.id,c.target_type,c.dataset_id,c.data_source_id,c.catalog_identity_key,c.target_locator,c.column_name,
  l.code,l.category,l.sensitivity_level,l.privacy_category,l.handling_requirements;
grant select on governance.privacy_control_hooks to authenticated,service_role;

-- Application users can read governance state but cannot mutate authority-bearing classification/privacy tables directly.
revoke insert,update,delete on governance.dataset_classifications from authenticated;
revoke insert,update,delete on governance.classification_labels from authenticated;
revoke insert,update,delete on governance.classification_policies from authenticated;
revoke insert,update,delete on governance.critical_data_elements from authenticated;
revoke insert,update,delete on governance.cde_mappings from authenticated;

drop policy if exists dataset_classifications_project_access on governance.dataset_classifications;
create policy dataset_classifications_project_read on governance.dataset_classifications for select to authenticated using (app_private.is_project_member(project_id));
drop policy if exists classification_labels_project_access on governance.classification_labels;
create policy classification_labels_project_read on governance.classification_labels for select to authenticated using (project_id is null or app_private.is_project_member(project_id));
drop policy if exists classification_policies_project_access on governance.classification_policies;
create policy classification_policies_project_read on governance.classification_policies for select to authenticated using (app_private.is_project_member(project_id));

create or replace function governance.verify_classification_privacy_posture()
returns jsonb language sql stable security definer set search_path='pg_catalog','governance' as $$
with acl as (
  select c.relname,coalesce(c.relacl,'{}'::aclitem[]) acl from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='governance' and c.relname in ('dataset_classifications','classification_labels','classification_policies','critical_data_elements','cde_mappings')
), direct_write as (
  select count(*)::int cnt from acl a where exists(select 1 from unnest(a.acl) x where x::text like 'authenticated=%' and x::text ~ 'authenticated=[^/]*(a|w|d)')
), event_acl as (
  select count(*)::int cnt from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='governance' and p.proname in ('capture_classification_event','classification_events_append_only','on_catalog_revision_refresh_classifications')
    and exists(select 1 from unnest(coalesce(p.proacl,'{}'::aclitem[])) x where x::text like 'authenticated=%X%')
)
select jsonb_build_object(
  'valid',(select cnt=0 from direct_write) and (select cnt=0 from event_acl)
    and to_regclass('governance.classification_events') is not null
    and to_regclass('governance.classification_catalog_coverage') is not null
    and to_regclass('governance.privacy_control_hooks') is not null,
  'stable_catalog_identity',true,'field_locator_semantics','DERIVED_LOCATOR_VALIDATED_AGAINST_CURRENT_ASSET',
  'source_observation_is_authority',false,'ai_suggestion_is_authority',false,'human_review_required_for_authority',true,
  'classification_events_append_only',true,'catalog_refresh_non_blocking',true,
  'authenticated_direct_write',(select cnt>0 from direct_write),'exposed_internal_execute_count',(select cnt from event_acl),
  'external_enforcement_authority','NOT_CLAIMED'
); $$;
revoke all on function governance.verify_classification_privacy_posture() from public,anon,authenticated;
grant execute on function governance.verify_classification_privacy_posture() to service_role;

comment on table governance.dataset_classifications is 'Governed classifications and source/AI observations. Catalog targets bind to stable provider identity; paths and field names are locators, not immutable field identity.';
comment on view governance.privacy_control_hooks is 'Declarative privacy/control intent only. DataNexus does not claim source masking/access enforcement from this view.';
