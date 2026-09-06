-- Business glossary / semantics hardening.
-- Separate bootstrap reference concepts from human-governed business meaning,
-- preserve immutable semantic versions, and bind mappings to governed/catalog identity.

alter table governance.glossary_terms
  add column if not exists authority_type text not null default 'HUMAN_GOVERNED',
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists last_changed_by uuid references auth.users(id) on delete set null,
  add column if not exists provenance jsonb not null default '{}'::jsonb;

alter table governance.glossary_terms drop constraint if exists glossary_terms_status_check;
alter table governance.glossary_terms add constraint glossary_terms_status_check
  check (status in ('REFERENCE','DRAFT','IN_REVIEW','APPROVED','DEPRECATED'));
alter table governance.glossary_terms drop constraint if exists glossary_terms_authority_type_check;
alter table governance.glossary_terms add constraint glossary_terms_authority_type_check
  check (authority_type in ('REFERENCE_BOOTSTRAP','HUMAN_GOVERNED','IMPORTED_GOVERNED','AI_SUGGESTED'));
alter table governance.glossary_terms drop constraint if exists glossary_terms_reference_authority_check;
alter table governance.glossary_terms add constraint glossary_terms_reference_authority_check
  check ((status='REFERENCE') = (authority_type='REFERENCE_BOOTSTRAP'));

-- Existing AI bootstrap terms are vocabulary references, not steward-approved enterprise meaning.
update governance.glossary_terms
set status='REFERENCE',
    authority_type='REFERENCE_BOOTSTRAP',
    approved_by=null,
    approved_at=null,
    provenance=coalesce(provenance,'{}'::jsonb) || jsonb_build_object(
      'origin','AI_GOVERNANCE_KNOWLEDGE_BOOTSTRAP',
      'authoritative',false,
      'reference_only',true
    ),
    updated_at=now()
where coalesce((metadata->>'synthetic_bootstrap')::boolean,false)=true;

-- A legacy APPROVED row without approval evidence is review material, not governed authority.
update governance.glossary_terms
set status='IN_REVIEW',
    provenance=coalesce(provenance,'{}'::jsonb) || jsonb_build_object('legacy_approval_evidence_missing',true),
    updated_at=now()
where status='APPROVED' and (approved_by is null or approved_at is null);

alter table governance.glossary_terms drop constraint if exists glossary_terms_approval_evidence_check;
alter table governance.glossary_terms add constraint glossary_terms_approval_evidence_check
  check (status <> 'APPROVED' or (approved_by is not null and approved_at is not null and authority_type <> 'REFERENCE_BOOTSTRAP'));

create unique index if not exists glossary_terms_project_term_ci_unique
  on governance.glossary_terms(project_id,lower(btrim(term)));

create table if not exists governance.glossary_term_versions (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references governance.glossary_terms(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  term text not null,
  definition text not null,
  domain text,
  synonyms text[] not null default '{}',
  status text not null check (status in ('REFERENCE','DRAFT','IN_REVIEW','APPROVED','DEPRECATED')),
  authority_type text not null check (authority_type in ('REFERENCE_BOOTSTRAP','HUMAN_GOVERNED','IMPORTED_GOVERNED','AI_SUGGESTED')),
  owner_user_id uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  change_kind text not null check (change_kind in ('BASELINE','CREATED','SEMANTIC_CHANGED','STATUS_CHANGED','AUTHORITY_CHANGED')),
  changed_by uuid references auth.users(id) on delete set null,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(term_id,version_number)
);
create index if not exists glossary_term_versions_project_recent_idx
  on governance.glossary_term_versions(project_id,created_at desc);
create index if not exists glossary_term_versions_published_idx
  on governance.glossary_term_versions(project_id,term_id,version_number desc)
  where status='APPROVED';
alter table governance.glossary_term_versions enable row level security;
drop policy if exists glossary_term_versions_select on governance.glossary_term_versions;
create policy glossary_term_versions_select on governance.glossary_term_versions
  for select to authenticated using (app_private.is_project_member(project_id));
revoke all on governance.glossary_term_versions from anon,authenticated;
grant select on governance.glossary_term_versions to authenticated;
grant all on governance.glossary_term_versions to service_role;

insert into governance.glossary_term_versions(
  term_id,project_id,version_number,term,definition,domain,synonyms,status,authority_type,
  owner_user_id,approved_by,approved_at,change_kind,changed_by,provenance,created_at
)
select t.id,t.project_id,1,t.term,t.definition,t.domain,t.synonyms,t.status,t.authority_type,
       t.owner_user_id,t.approved_by,t.approved_at,'BASELINE',t.last_changed_by,t.provenance,t.updated_at
from governance.glossary_terms t
where not exists(select 1 from governance.glossary_term_versions v where v.term_id=t.id);

create or replace view governance.published_glossary_terms
with (security_invoker=true) as
select distinct on (v.term_id)
  v.term_id as id,v.project_id,v.version_number,v.term,v.definition,v.domain,v.synonyms,
  v.authority_type,v.owner_user_id,v.approved_by,v.approved_at,v.provenance,v.created_at as published_at
from governance.glossary_term_versions v
where v.status='APPROVED' and v.authority_type <> 'REFERENCE_BOOTSTRAP'
order by v.term_id,v.version_number desc;

create or replace view governance.glossary_reference_concepts
with (security_invoker=true) as
select t.id,t.project_id,t.term,t.definition,t.domain,t.synonyms,t.provenance,t.created_at,t.updated_at
from governance.glossary_terms t
where t.status='REFERENCE' and t.authority_type='REFERENCE_BOOTSTRAP';

grant select on governance.published_glossary_terms to authenticated,service_role;
grant select on governance.glossary_reference_concepts to authenticated,service_role;

alter table governance.glossary_mappings
  add column if not exists target_type text not null default 'DATASET',
  add column if not exists discovered_asset_id uuid references catalog.discovered_assets(id) on delete restrict,
  add column if not exists data_source_id uuid references catalog.data_sources(id) on delete set null,
  add column if not exists catalog_identity_key text,
  add column if not exists mapping_status text not null default 'PROPOSED',
  add column if not exists origin text not null default 'HUMAN',
  add column if not exists proposed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists term_version_number integer,
  add column if not exists validation_state text not null default 'UNVERIFIED',
  add column if not exists evidence jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

alter table governance.glossary_mappings alter column dataset_id drop not null;
alter table governance.glossary_mappings drop constraint if exists glossary_mappings_term_id_dataset_id_column_name_key;

update governance.glossary_mappings gm
set target_type='DATASET',
    mapping_status=case when gm.approved then 'APPROVED' else 'PROPOSED' end,
    origin=case when coalesce((gt.metadata->>'synthetic_bootstrap')::boolean,false) then 'AI_SUGGESTED' else 'HUMAN' end,
    validation_state='UNVERIFIED',
    updated_at=now()
from governance.glossary_terms gt
where gt.id=gm.term_id;

-- Legacy approved mappings cannot remain authoritative when their term was demoted from unevidenced approval.
update governance.glossary_mappings gm
set mapping_status='NEEDS_REVIEW',approved=false,approved_by=null,reviewed_by=null,reviewed_at=null,term_version_number=null,updated_at=now()
where gm.mapping_status='APPROVED'
  and not exists(select 1 from governance.glossary_terms gt where gt.id=gm.term_id and gt.status='APPROVED' and gt.authority_type<>'REFERENCE_BOOTSTRAP');

alter table governance.glossary_mappings drop constraint if exists glossary_mappings_target_type_check;
alter table governance.glossary_mappings add constraint glossary_mappings_target_type_check
  check (target_type in ('DATASET','CATALOG_ASSET'));
alter table governance.glossary_mappings drop constraint if exists glossary_mappings_target_shape_check;
alter table governance.glossary_mappings add constraint glossary_mappings_target_shape_check
  check (
    (target_type='DATASET' and dataset_id is not null and discovered_asset_id is null and catalog_identity_key is null)
    or
    (target_type='CATALOG_ASSET' and dataset_id is null and discovered_asset_id is not null and data_source_id is not null and catalog_identity_key is not null)
  );
alter table governance.glossary_mappings drop constraint if exists glossary_mappings_status_check;
alter table governance.glossary_mappings add constraint glossary_mappings_status_check
  check (mapping_status in ('PROPOSED','APPROVED','REJECTED','NEEDS_REVIEW'));
alter table governance.glossary_mappings drop constraint if exists glossary_mappings_origin_check;
alter table governance.glossary_mappings add constraint glossary_mappings_origin_check
  check (origin in ('HUMAN','AI_SUGGESTED','IMPORTED','BOOTSTRAP'));
alter table governance.glossary_mappings drop constraint if exists glossary_mappings_validation_state_check;
alter table governance.glossary_mappings add constraint glossary_mappings_validation_state_check
  check (validation_state in ('VALID','UNVERIFIED','STALE'));
alter table governance.glossary_mappings drop constraint if exists glossary_mappings_approved_state_check;
alter table governance.glossary_mappings add constraint glossary_mappings_approved_state_check
  check (approved = (mapping_status='APPROVED'));

create unique index if not exists glossary_mappings_dataset_identity_unique
  on governance.glossary_mappings(term_id,dataset_id,coalesce(lower(column_name),''))
  where target_type='DATASET';
create unique index if not exists glossary_mappings_catalog_identity_unique
  on governance.glossary_mappings(term_id,data_source_id,catalog_identity_key,coalesce(lower(column_name),''))
  where target_type='CATALOG_ASSET';
create index if not exists glossary_mappings_catalog_target_idx
  on governance.glossary_mappings(data_source_id,catalog_identity_key)
  where target_type='CATALOG_ASSET';
create index if not exists glossary_mappings_review_queue_idx
  on governance.glossary_mappings(mapping_status,created_at)
  where mapping_status in ('PROPOSED','NEEDS_REVIEW');

create or replace function governance.enforce_glossary_mapping_integrity()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_term_project uuid;
  v_term_status text;
  v_term_authority text;
  v_dataset record;
  v_asset record;
  v_published_version integer;
begin
  select project_id,status,authority_type into v_term_project,v_term_status,v_term_authority
  from governance.glossary_terms where id=new.term_id;
  if v_term_project is null then raise exception 'Glossary term not found'; end if;

  new.column_name := nullif(btrim(coalesce(new.column_name,'')),'');
  new.updated_at := now();

  if new.target_type='DATASET' then
    select d.project_id,d.data_source_id into v_dataset from catalog.datasets d where d.id=new.dataset_id;
    if v_dataset.project_id is null then raise exception 'Glossary mapping dataset not found'; end if;
    if v_dataset.project_id<>v_term_project then raise exception 'Glossary term and dataset must belong to the same project'; end if;
    new.discovered_asset_id := null;
    new.catalog_identity_key := null;
    new.data_source_id := v_dataset.data_source_id;
    new.validation_state := 'UNVERIFIED';
  elsif new.target_type='CATALOG_ASSET' then
    select da.id,da.source_id,da.identity_key,da.columns,ds.project_id
      into v_asset
    from catalog.discovered_assets da
    join catalog.data_sources ds on ds.id=da.source_id
    where da.id=new.discovered_asset_id and da.is_current;
    if v_asset.id is null then raise exception 'Glossary catalog mapping requires a current discovered asset'; end if;
    if v_asset.project_id<>v_term_project then raise exception 'Glossary term and catalog asset must belong to the same project'; end if;
    if v_asset.identity_key is null or btrim(v_asset.identity_key)='' then raise exception 'Glossary catalog mapping requires stable catalog identity evidence'; end if;
    if new.column_name is not null and not exists(
      select 1 from jsonb_array_elements(coalesce(v_asset.columns,'[]'::jsonb)) c
      where lower(btrim(coalesce(c->>'name','')))=lower(new.column_name)
    ) then
      raise exception 'Glossary field mapping column % is not present on the current catalog asset',new.column_name;
    end if;
    new.dataset_id := null;
    new.data_source_id := v_asset.source_id;
    new.catalog_identity_key := v_asset.identity_key;
    new.validation_state := 'VALID';
  else
    raise exception 'Unsupported glossary mapping target type';
  end if;

  if new.mapping_status='APPROVED' then
    if new.approved_by is null then raise exception 'Approved glossary mappings require an accountable approver'; end if;
    if v_term_status<>'APPROVED' or v_term_authority='REFERENCE_BOOTSTRAP' then
      raise exception 'Glossary mappings can only be approved for a currently approved governed term';
    end if;
    if new.target_type='CATALOG_ASSET' and new.validation_state<>'VALID' then
      raise exception 'Catalog glossary mappings must be valid before approval';
    end if;
    select max(version_number) into v_published_version
    from governance.glossary_term_versions
    where term_id=new.term_id and status='APPROVED' and authority_type<>'REFERENCE_BOOTSTRAP';
    if v_published_version is null then raise exception 'Approved glossary mapping requires a published governed term version'; end if;
    new.term_version_number := v_published_version;
    new.approved := true;
    new.reviewed_by := coalesce(new.reviewed_by,new.approved_by);
    new.reviewed_at := coalesce(new.reviewed_at,now());
  else
    new.approved := false;
    new.approved_by := null;
    if new.mapping_status='PROPOSED' then
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.term_version_number := null;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists glossary_mapping_integrity on governance.glossary_mappings;
create trigger glossary_mapping_integrity
before insert or update on governance.glossary_mappings
for each row execute function governance.enforce_glossary_mapping_integrity();

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
       set mapping_status='NEEDS_REVIEW',approved=false,approved_by=null,reviewed_by=null,reviewed_at=null,updated_at=now()
     where term_id=new.id and mapping_status='APPROVED' and coalesce(term_version_number,0)<>v_next;
  end if;
  return new;
end;
$function$;

drop trigger if exists glossary_term_version_capture on governance.glossary_terms;
create trigger glossary_term_version_capture
after insert or update on governance.glossary_terms
for each row execute function governance.capture_glossary_term_version();

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
     set validation_state='STALE',updated_at=now()
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

revoke all on function governance.refresh_glossary_mapping_validity(uuid) from public,anon,authenticated;
grant execute on function governance.refresh_glossary_mapping_validity(uuid) to service_role;

create or replace view governance.current_business_semantics
with (security_invoker=true) as
select
  p.project_id,p.id as term_id,p.version_number as term_version_number,p.term,p.definition,p.domain,p.synonyms,
  p.authority_type,p.owner_user_id,p.approved_by,p.approved_at,
  gm.id as mapping_id,gm.target_type,gm.dataset_id,gm.discovered_asset_id,gm.data_source_id,
  gm.catalog_identity_key,gm.column_name,gm.mapping_status,gm.validation_state,gm.origin,gm.confidence,gm.evidence
from governance.published_glossary_terms p
left join governance.glossary_mappings gm
  on gm.term_id=p.id
 and gm.mapping_status='APPROVED'
 and gm.term_version_number=p.version_number;

grant select on governance.current_business_semantics to authenticated,service_role;

comment on table governance.glossary_term_versions is 'Immutable business-term semantic history; approved versions remain authoritative while a newer draft is being edited.';
comment on view governance.published_glossary_terms is 'Latest human/imported approved semantic version for each term; bootstrap references are excluded from authority.';
comment on view governance.current_business_semantics is 'Published governed semantics with mapping evidence bound to the approved term version.';
