-- Make glossary semantic history and mapping review evidence append-only and transactionally audited.

alter table governance.glossary_mappings
  add column if not exists last_changed_by uuid references auth.users(id) on delete set null;

-- Semantic versions are written only by the SECURITY DEFINER capture trigger.
revoke insert,update,delete on governance.glossary_term_versions from anon,authenticated,service_role;
grant select on governance.glossary_term_versions to authenticated,service_role;

drop trigger if exists glossary_term_versions_append_only on governance.glossary_term_versions;
create trigger glossary_term_versions_append_only
before update or delete on governance.glossary_term_versions
for each row execute function governance.reject_append_only_mutation();

create table if not exists governance.glossary_mapping_decisions (
  id uuid primary key default gen_random_uuid(),
  mapping_id uuid not null references governance.glossary_mappings(id) on delete restrict,
  term_id uuid not null references governance.glossary_terms(id) on delete restrict,
  project_id uuid not null references app.projects(id) on delete cascade,
  decision_sequence integer not null check (decision_sequence > 0),
  decision_type text not null check (decision_type in ('BASELINE','CREATED','APPROVED','REJECTED','REOPENED','INVALIDATED','REFRESHED','CHANGED')),
  mapping_status text not null,
  target_type text not null,
  dataset_id uuid references catalog.datasets(id) on delete set null,
  discovered_asset_id uuid references catalog.discovered_assets(id) on delete set null,
  data_source_id uuid references catalog.data_sources(id) on delete set null,
  catalog_identity_key text,
  column_name text,
  term_version_number integer,
  validation_state text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(mapping_id,decision_sequence)
);
create index if not exists glossary_mapping_decisions_project_recent_idx
  on governance.glossary_mapping_decisions(project_id,created_at desc);
create index if not exists glossary_mapping_decisions_mapping_idx
  on governance.glossary_mapping_decisions(mapping_id,decision_sequence desc);

alter table governance.glossary_mapping_decisions enable row level security;
drop policy if exists glossary_mapping_decisions_select on governance.glossary_mapping_decisions;
create policy glossary_mapping_decisions_select on governance.glossary_mapping_decisions
  for select to authenticated using (app_private.is_project_member(project_id));

insert into governance.glossary_mapping_decisions(
  mapping_id,term_id,project_id,decision_sequence,decision_type,mapping_status,target_type,
  dataset_id,discovered_asset_id,data_source_id,catalog_identity_key,column_name,term_version_number,
  validation_state,actor_user_id,evidence,created_at
)
select gm.id,gm.term_id,gt.project_id,1,'BASELINE',gm.mapping_status,gm.target_type,
       gm.dataset_id,gm.discovered_asset_id,gm.data_source_id,gm.catalog_identity_key,gm.column_name,
       gm.term_version_number,gm.validation_state,coalesce(gm.reviewed_by,gm.approved_by,gm.proposed_by),
       coalesce(gm.evidence,'{}'::jsonb)||jsonb_build_object('baseline',true),gm.created_at
from governance.glossary_mappings gm
join governance.glossary_terms gt on gt.id=gm.term_id
where not exists(select 1 from governance.glossary_mapping_decisions d where d.mapping_id=gm.id);

revoke all on governance.glossary_mapping_decisions from anon,authenticated,service_role;
grant select on governance.glossary_mapping_decisions to authenticated,service_role;

drop trigger if exists glossary_mapping_decisions_append_only on governance.glossary_mapping_decisions;
create trigger glossary_mapping_decisions_append_only
before update or delete on governance.glossary_mapping_decisions
for each row execute function governance.reject_append_only_mutation();

create or replace function governance.capture_glossary_mapping_decision()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_project uuid;
  v_next integer;
  v_type text;
  v_actor uuid;
begin
  if tg_op='UPDATE'
     and old.mapping_status is not distinct from new.mapping_status
     and old.target_type is not distinct from new.target_type
     and old.dataset_id is not distinct from new.dataset_id
     and old.discovered_asset_id is not distinct from new.discovered_asset_id
     and old.data_source_id is not distinct from new.data_source_id
     and old.catalog_identity_key is not distinct from new.catalog_identity_key
     and old.column_name is not distinct from new.column_name
     and old.term_version_number is not distinct from new.term_version_number
     and old.validation_state is not distinct from new.validation_state
     and old.approved is not distinct from new.approved
     and old.approved_by is not distinct from new.approved_by
     and old.reviewed_by is not distinct from new.reviewed_by
     and old.reviewed_at is not distinct from new.reviewed_at
     and old.evidence is not distinct from new.evidence then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text,0));
  select project_id into v_project from governance.glossary_terms where id=new.term_id;
  select coalesce(max(decision_sequence),0)+1 into v_next
    from governance.glossary_mapping_decisions where mapping_id=new.id;

  if tg_op='INSERT' then
    v_type:='CREATED';
    v_actor:=new.proposed_by;
  elsif old.mapping_status is distinct from new.mapping_status then
    v_type:=case new.mapping_status
      when 'APPROVED' then 'APPROVED'
      when 'REJECTED' then 'REJECTED'
      when 'PROPOSED' then 'REOPENED'
      when 'NEEDS_REVIEW' then 'INVALIDATED'
      else 'CHANGED' end;
    v_actor:=case when new.evidence is distinct from old.evidence then new.last_changed_by else null end;
  elsif old.validation_state is distinct from new.validation_state then
    v_type:=case when new.validation_state='STALE' then 'INVALIDATED' else 'REFRESHED' end;
    v_actor:=case when new.evidence is distinct from old.evidence then new.last_changed_by else null end;
  else
    v_type:='CHANGED';
    v_actor:=case when new.evidence is distinct from old.evidence then new.last_changed_by else null end;
  end if;

  insert into governance.glossary_mapping_decisions(
    mapping_id,term_id,project_id,decision_sequence,decision_type,mapping_status,target_type,
    dataset_id,discovered_asset_id,data_source_id,catalog_identity_key,column_name,term_version_number,
    validation_state,actor_user_id,evidence
  ) values (
    new.id,new.term_id,v_project,v_next,v_type,new.mapping_status,new.target_type,
    new.dataset_id,new.discovered_asset_id,new.data_source_id,new.catalog_identity_key,new.column_name,
    new.term_version_number,new.validation_state,v_actor,coalesce(new.evidence,'{}'::jsonb)
  );
  return new;
end;
$function$;

revoke all on function governance.capture_glossary_mapping_decision() from public,anon,authenticated,service_role;

drop trigger if exists glossary_mapping_decision_capture on governance.glossary_mappings;
create trigger glossary_mapping_decision_capture
after insert or update of mapping_status,target_type,dataset_id,discovered_asset_id,data_source_id,catalog_identity_key,column_name,term_version_number,validation_state,approved,approved_by,reviewed_by,reviewed_at,evidence
on governance.glossary_mappings
for each row execute function governance.capture_glossary_mapping_decision();

-- System-driven invalidation must never inherit a prior user's identity.
create or replace function governance.capture_glossary_term_version()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_next integer;
  v_kind text;
begin
  if tg_op='UPDATE'
     and old.term is not distinct from new.term
     and old.definition is not distinct from new.definition
     and old.domain is not distinct from new.domain
     and old.synonyms is not distinct from new.synonyms
     and old.status is not distinct from new.status
     and old.authority_type is not distinct from new.authority_type
     and old.owner_user_id is not distinct from new.owner_user_id
     and old.approved_by is not distinct from new.approved_by
     and old.approved_at is not distinct from new.approved_at then
    return new;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text,0));
  select coalesce(max(version_number),0)+1 into v_next
  from governance.glossary_term_versions where term_id=new.id;

  if tg_op='INSERT' then
    v_kind := 'CREATED';
  elsif old.authority_type is distinct from new.authority_type then
    v_kind := 'AUTHORITY_CHANGED';
  elsif old.status is distinct from new.status then
    v_kind := 'STATUS_CHANGED';
  else
    v_kind := 'SEMANTIC_CHANGED';
  end if;

  insert into governance.glossary_term_versions(
    term_id,project_id,version_number,term,definition,domain,synonyms,status,authority_type,
    owner_user_id,approved_by,approved_at,change_kind,changed_by,provenance
  ) values (
    new.id,new.project_id,v_next,new.term,new.definition,new.domain,new.synonyms,new.status,new.authority_type,
    new.owner_user_id,new.approved_by,new.approved_at,v_kind,new.last_changed_by,new.provenance
  );

  if new.status='APPROVED' and new.authority_type<>'REFERENCE_BOOTSTRAP' then
    update governance.glossary_mappings
       set mapping_status='NEEDS_REVIEW',approved=false,approved_by=null,reviewed_by=null,reviewed_at=null,
           last_changed_by=null,updated_at=now()
     where term_id=new.id and mapping_status='APPROVED' and coalesce(term_version_number,0)<>v_next;
  elsif new.status='DEPRECATED' then
    update governance.glossary_mappings
       set mapping_status='NEEDS_REVIEW',approved=false,approved_by=null,reviewed_by=null,reviewed_at=null,
           last_changed_by=null,updated_at=now()
     where term_id=new.id and mapping_status='APPROVED';
  end if;
  return new;
end;
$function$;

create or replace function governance.refresh_glossary_mapping_validity(p_source_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_valid integer;
  v_stale integer;
begin
  if p_source_id is null then raise exception 'source id is required'; end if;

  update governance.glossary_mappings gm
     set validation_state='STALE',last_changed_by=null,updated_at=now()
   where gm.target_type='CATALOG_ASSET'
     and gm.data_source_id=p_source_id
     and not exists(
       select 1 from catalog.discovered_assets da
       where da.source_id=p_source_id and da.is_current and da.identity_key=gm.catalog_identity_key
     );

  update governance.glossary_mappings gm
     set discovered_asset_id=da.id,
         validation_state=case
           when gm.column_name is null then 'VALID'
           when exists(
             select 1 from jsonb_array_elements(coalesce(da.columns,'[]'::jsonb)) c
             where lower(btrim(coalesce(c->>'name','')))=lower(gm.column_name)
           ) then 'VALID'
           else 'STALE'
         end,
         last_changed_by=null,
         updated_at=now()
  from catalog.discovered_assets da
  where gm.target_type='CATALOG_ASSET'
    and gm.data_source_id=p_source_id
    and da.source_id=p_source_id
    and da.is_current
    and da.identity_key=gm.catalog_identity_key;

  select count(*) filter(where validation_state='VALID'),count(*) filter(where validation_state='STALE')
    into v_valid,v_stale
  from governance.glossary_mappings
  where target_type='CATALOG_ASSET' and data_source_id=p_source_id;

  return jsonb_build_object('source_id',p_source_id,'valid',coalesce(v_valid,0),'stale',coalesce(v_stale,0));
end;
$function$;

create or replace function governance.audit_glossary_term_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_event text;
  v_version integer;
  v_semantic_changed boolean:=false;
begin
  if tg_op='UPDATE' then
    v_semantic_changed:=old.term is distinct from new.term
      or old.definition is distinct from new.definition
      or old.domain is distinct from new.domain
      or old.synonyms is distinct from new.synonyms
      or old.owner_user_id is distinct from new.owner_user_id;
    if not v_semantic_changed
       and old.status is not distinct from new.status
       and old.authority_type is not distinct from new.authority_type
       and old.approved_by is not distinct from new.approved_by
       and old.approved_at is not distinct from new.approved_at then
      return new;
    end if;
  end if;

  select max(version_number) into v_version from governance.glossary_term_versions where term_id=new.id;
  if tg_op='INSERT' then
    v_event:='GLOSSARY_TERM_CREATED';
  elsif v_semantic_changed and old.status in ('APPROVED','IN_REVIEW') and new.status='DRAFT' then
    v_event:='GLOSSARY_TERM_REVISION_OPENED';
  elsif old.status='REFERENCE' and new.status='DRAFT' and old.authority_type='REFERENCE_BOOTSTRAP' and new.authority_type<>'REFERENCE_BOOTSTRAP' then
    v_event:='GLOSSARY_REFERENCE_ADOPTED';
  elsif old.status='DRAFT' and new.status='IN_REVIEW' then
    v_event:='GLOSSARY_TERM_SUBMITTED';
  elsif old.status='IN_REVIEW' and new.status='APPROVED' then
    v_event:='GLOSSARY_TERM_APPROVED';
  elsif old.status='APPROVED' and new.status='DEPRECATED' then
    v_event:='GLOSSARY_TERM_DEPRECATED';
  elsif old.status='DEPRECATED' and new.status='DRAFT' then
    v_event:='GLOSSARY_TERM_REOPENED';
  elsif v_semantic_changed then
    v_event:='GLOSSARY_TERM_UPDATED';
  elsif old.authority_type is distinct from new.authority_type then
    v_event:='GLOSSARY_TERM_AUTHORITY_CHANGED';
  else
    v_event:='GLOSSARY_TERM_STATE_CHANGED';
  end if;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(new.project_id,new.last_changed_by,case when new.last_changed_by is null then 'SYSTEM' else 'USER' end,
         v_event,'GLOSSARY_TERM',new.id,
         jsonb_build_object('version_number',v_version,'prior_status',case when tg_op='UPDATE' then old.status else null end,
                            'new_status',new.status,'authority_type',new.authority_type));
  return new;
end;
$function$;

revoke all on function governance.audit_glossary_term_change() from public,anon,authenticated,service_role;
drop trigger if exists zz_glossary_term_transactional_audit on governance.glossary_terms;
create trigger zz_glossary_term_transactional_audit
after insert or update of term,definition,domain,synonyms,status,authority_type,owner_user_id,approved_by,approved_at
on governance.glossary_terms
for each row execute function governance.audit_glossary_term_change();

create or replace function governance.audit_glossary_mapping_change()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_decision governance.glossary_mapping_decisions%rowtype;
  v_event text;
begin
  if tg_op='UPDATE'
     and old.mapping_status is not distinct from new.mapping_status
     and old.target_type is not distinct from new.target_type
     and old.dataset_id is not distinct from new.dataset_id
     and old.discovered_asset_id is not distinct from new.discovered_asset_id
     and old.data_source_id is not distinct from new.data_source_id
     and old.catalog_identity_key is not distinct from new.catalog_identity_key
     and old.column_name is not distinct from new.column_name
     and old.term_version_number is not distinct from new.term_version_number
     and old.validation_state is not distinct from new.validation_state
     and old.approved is not distinct from new.approved
     and old.approved_by is not distinct from new.approved_by
     and old.reviewed_by is not distinct from new.reviewed_by
     and old.reviewed_at is not distinct from new.reviewed_at
     and old.evidence is not distinct from new.evidence then
    return new;
  end if;

  select * into v_decision from governance.glossary_mapping_decisions
   where mapping_id=new.id order by decision_sequence desc limit 1;
  if v_decision.id is null then raise exception 'Glossary mapping decision evidence was not captured'; end if;
  v_event:=case v_decision.decision_type
    when 'CREATED' then 'GLOSSARY_MAPPING_PROPOSED'
    when 'APPROVED' then 'GLOSSARY_MAPPING_APPROVED'
    when 'REJECTED' then 'GLOSSARY_MAPPING_REJECTED'
    when 'REOPENED' then 'GLOSSARY_MAPPING_REOPENED'
    when 'INVALIDATED' then 'GLOSSARY_MAPPING_INVALIDATED'
    when 'REFRESHED' then 'GLOSSARY_MAPPING_REFRESHED'
    else 'GLOSSARY_MAPPING_CHANGED' end;

  insert into governance.audit_events(project_id,actor_user_id,actor_type,event_type,entity_type,entity_id,metadata)
  values(v_decision.project_id,v_decision.actor_user_id,case when v_decision.actor_user_id is null then 'SYSTEM' else 'USER' end,
         v_event,'GLOSSARY_MAPPING',new.id,
         jsonb_build_object('decision_sequence',v_decision.decision_sequence,'decision_type',v_decision.decision_type,
                            'term_id',new.term_id,'prior_status',case when tg_op='UPDATE' then old.mapping_status else null end,
                            'new_status',new.mapping_status,'term_version_number',new.term_version_number,
                            'validation_state',new.validation_state,'target_type',new.target_type));
  return new;
end;
$function$;

revoke all on function governance.audit_glossary_mapping_change() from public,anon,authenticated,service_role;
drop trigger if exists zz_glossary_mapping_transactional_audit on governance.glossary_mappings;
create trigger zz_glossary_mapping_transactional_audit
after insert or update of mapping_status,target_type,dataset_id,discovered_asset_id,data_source_id,catalog_identity_key,column_name,term_version_number,validation_state,approved,approved_by,reviewed_by,reviewed_at,evidence
on governance.glossary_mappings
for each row execute function governance.audit_glossary_mapping_change();

create or replace function governance.verify_glossary_evidence_posture()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_term_append boolean;
  v_mapping_append boolean;
  v_term_audit boolean;
  v_mapping_audit boolean;
  v_term_history_write boolean;
  v_mapping_history_write boolean;
begin
  select exists(select 1 from pg_trigger where tgrelid='governance.glossary_term_versions'::regclass and tgname='glossary_term_versions_append_only' and not tgisinternal and tgenabled<>'D') into v_term_append;
  select exists(select 1 from pg_trigger where tgrelid='governance.glossary_mapping_decisions'::regclass and tgname='glossary_mapping_decisions_append_only' and not tgisinternal and tgenabled<>'D') into v_mapping_append;
  select exists(select 1 from pg_trigger where tgrelid='governance.glossary_terms'::regclass and tgname='zz_glossary_term_transactional_audit' and not tgisinternal and tgenabled<>'D') into v_term_audit;
  select exists(select 1 from pg_trigger where tgrelid='governance.glossary_mappings'::regclass and tgname='zz_glossary_mapping_transactional_audit' and not tgisinternal and tgenabled<>'D') into v_mapping_audit;
  v_term_history_write:=has_table_privilege('service_role','governance.glossary_term_versions','INSERT')
    or has_table_privilege('service_role','governance.glossary_term_versions','UPDATE')
    or has_table_privilege('service_role','governance.glossary_term_versions','DELETE');
  v_mapping_history_write:=has_table_privilege('service_role','governance.glossary_mapping_decisions','INSERT')
    or has_table_privilege('service_role','governance.glossary_mapping_decisions','UPDATE')
    or has_table_privilege('service_role','governance.glossary_mapping_decisions','DELETE');
  return jsonb_build_object(
    'valid',v_term_append and v_mapping_append and v_term_audit and v_mapping_audit and not v_term_history_write and not v_mapping_history_write,
    'term_versions_append_only',v_term_append,
    'mapping_decisions_append_only',v_mapping_append,
    'term_transactional_audit',v_term_audit,
    'mapping_transactional_audit',v_mapping_audit,
    'service_role_term_history_write',v_term_history_write,
    'service_role_mapping_history_write',v_mapping_history_write
  );
end;
$function$;

revoke all on function governance.verify_glossary_evidence_posture() from public,anon,authenticated;
grant execute on function governance.verify_glossary_evidence_posture() to service_role;

comment on table governance.glossary_mapping_decisions is 'Append-only semantic mapping decision evidence. Application and system state changes are captured transactionally before the mutation commits.';
comment on function governance.verify_glossary_evidence_posture() is 'Verifies DB-enforced immutability and transactional audit controls for governed glossary semantics.';
