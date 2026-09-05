-- Harden metadata identity, versioning, and change detection without changing source authority.

create table if not exists catalog.asset_identity_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  identity_key text not null,
  provider text not null,
  provider_object_id text,
  object_kind text not null default 'OBJECT',
  evidence_kind text not null check (evidence_kind in ('PROVIDER_IMMUTABLE_ID','PROVIDER_STABLE_ID','QUALIFIED_LOCATOR','IDENTITY_PROMOTION')),
  immutable boolean not null default false,
  confidence numeric(5,4),
  supersedes_identity_key text,
  evidence_source jsonb not null default '{}'::jsonb,
  first_seen_revision_id uuid references catalog.catalog_revisions(id) on delete set null,
  last_seen_revision_id uuid references catalog.catalog_revisions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (confidence is null or (confidence >= 0 and confidence <= 1))
);
create unique index if not exists asset_identity_evidence_unique
  on catalog.asset_identity_evidence(source_id, identity_key, evidence_kind, coalesce(provider_object_id,''));
create index if not exists asset_identity_evidence_provider_id_idx
  on catalog.asset_identity_evidence(source_id, provider, provider_object_id)
  where provider_object_id is not null;
create index if not exists asset_identity_evidence_identity_idx
  on catalog.asset_identity_evidence(source_id, identity_key);

alter table catalog.asset_identity_evidence enable row level security;
drop policy if exists asset_identity_evidence_select on catalog.asset_identity_evidence;
create policy asset_identity_evidence_select on catalog.asset_identity_evidence
  for select to authenticated using (app_private.is_project_member(project_id));
revoke all on catalog.asset_identity_evidence from anon, authenticated;
grant select on catalog.asset_identity_evidence to authenticated;
grant all on catalog.asset_identity_evidence to service_role;

create table if not exists catalog.asset_locator_history (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  scope_id uuid not null references catalog.source_scopes(id) on delete cascade,
  identity_key text not null,
  asset_key text not null,
  namespace text,
  name text not null,
  asset_type text,
  valid_from_revision_id uuid not null references catalog.catalog_revisions(id) on delete cascade,
  valid_to_revision_id uuid references catalog.catalog_revisions(id) on delete set null,
  change_kind text not null default 'OBSERVED' check (change_kind in ('OBSERVED','RENAMED','MOVED','MOVED_AND_RENAMED','IDENTITY_PROMOTED')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists asset_locator_history_revision_unique
  on catalog.asset_locator_history(scope_id, identity_key, valid_from_revision_id);
create unique index if not exists asset_locator_history_current_unique
  on catalog.asset_locator_history(scope_id, identity_key)
  where valid_to_revision_id is null;
create index if not exists asset_locator_history_asset_idx
  on catalog.asset_locator_history(source_id, asset_key, valid_from_revision_id);

alter table catalog.asset_locator_history enable row level security;
drop policy if exists asset_locator_history_select on catalog.asset_locator_history;
create policy asset_locator_history_select on catalog.asset_locator_history
  for select to authenticated using (app_private.is_project_member(project_id));
revoke all on catalog.asset_locator_history from anon, authenticated;
grant select on catalog.asset_locator_history to authenticated;
grant all on catalog.asset_locator_history to service_role;

create table if not exists catalog.catalog_field_change_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  scope_id uuid not null references catalog.source_scopes(id) on delete cascade,
  revision_id uuid not null references catalog.catalog_revisions(id) on delete cascade,
  change_event_id uuid references catalog.catalog_change_events(id) on delete set null,
  asset_identity_key text not null,
  asset_key text not null,
  field_identity_key text not null,
  field_name text not null,
  event_type text not null check (event_type in ('FIELD_ADDED','FIELD_REMOVED','FIELD_RENAMED','TYPE_CHANGED','NULLABILITY_CHANGED','POSITION_CHANGED','DEFAULT_CHANGED')),
  before_state jsonb,
  after_state jsonb,
  evidence jsonb not null default '{}'::jsonb,
  event_hash text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists catalog_field_change_events_hash_unique
  on catalog.catalog_field_change_events(event_hash);
create index if not exists catalog_field_change_events_revision_idx
  on catalog.catalog_field_change_events(revision_id, asset_identity_key, field_name);

alter table catalog.catalog_field_change_events enable row level security;
drop policy if exists catalog_field_change_events_select on catalog.catalog_field_change_events;
create policy catalog_field_change_events_select on catalog.catalog_field_change_events
  for select to authenticated using (app_private.is_project_member(project_id));
revoke all on catalog.catalog_field_change_events from anon, authenticated;
grant select on catalog.catalog_field_change_events to authenticated;
grant all on catalog.catalog_field_change_events to service_role;

-- Source annotations are metadata changes, but remain separate from physical structure versions.
alter table catalog.catalog_change_events drop constraint if exists catalog_change_events_change_type_check;
alter table catalog.catalog_change_events add constraint catalog_change_events_change_type_check
  check (change_type in ('ADDED','CHANGED','RESTORED','MISSING','REMOVED','OUT_OF_SCOPE','RENAMED','MOVED','INACCESSIBLE','SOURCE_ANNOTATION_CHANGED'));

-- Field native IDs are authoritative only when a provider explicitly marks them immutable.
create or replace function catalog.discovery_field_identity_key(p_column jsonb)
returns text
language plpgsql
immutable
set search_path to 'catalog','public'
as $function$
declare
  v_native jsonb := case
    when jsonb_typeof(coalesce(p_column,'{}'::jsonb)->'native_identity')='object' then coalesce(p_column,'{}'::jsonb)->'native_identity'
    when jsonb_typeof(coalesce(p_column,'{}'::jsonb)->'metadata'->'native_identity')='object' then coalesce(p_column,'{}'::jsonb)->'metadata'->'native_identity'
    else '{}'::jsonb end;
  v_id text;
begin
  v_id := nullif(v_native->>'id','');
  if v_id is not null and coalesce((v_native->>'immutable')::boolean,false) then
    return 'native:' || lower(v_id);
  end if;
  return 'name:' || lower(coalesce(p_column->>'name',''));
end
$function$;

-- Identity/locator hints are evidence, not physical structure. Exclude them from structure hashes.
create or replace function catalog.discovery_structure_payload(p_asset_type text, p_namespace text, p_name text, p_columns jsonb, p_metadata jsonb)
returns jsonb
language plpgsql
immutable
set search_path to 'catalog','public'
as $function$
declare
  v_metadata jsonb := coalesce(p_metadata,'{}'::jsonb)-array['row_count','validation_details','validation_errors','validation_warnings','remarks'];
  v_native jsonb;
  v_columns jsonb;
begin
  if jsonb_typeof(v_metadata->'native_metadata')='object' then
    v_native := (v_metadata->'native_metadata')-array['owner','comment','description','tags','labels'];
    v_metadata := jsonb_set(v_metadata,'{native_metadata}',v_native,true);
  end if;
  select coalesce(jsonb_agg(
    (value - array['native_id','qualified_name','native_identity']) ||
      case when jsonb_typeof(value->'metadata')='object'
        then jsonb_build_object('metadata',(value->'metadata')-array['comment','description','tags','labels','table_id','object_oid','attnum','parent_native_id','identity_evidence','native_identity'])
        else '{}'::jsonb end
    order by coalesce((value->>'ordinal')::integer,2147483647),value->>'name'
  ),'[]'::jsonb) into v_columns
  from jsonb_array_elements(coalesce(p_columns,'[]'::jsonb));
  return jsonb_build_object('asset_type',p_asset_type,'namespace',p_namespace,'name',p_name,'columns',v_columns,'metadata',v_metadata);
end
$function$;

create or replace function catalog.record_field_change_events(
  p_project_id uuid,
  p_source_id uuid,
  p_scope_id uuid,
  p_revision_id uuid,
  p_change_event_id uuid,
  p_asset_identity_key text,
  p_asset_key text,
  p_old_columns jsonb,
  p_new_columns jsonb
)
returns integer
language plpgsql
security definer
set search_path to 'catalog','public','extensions'
as $function$
declare
  v_old jsonb;
  v_new jsonb;
  v_old_match jsonb;
  v_new_match jsonb;
  v_identity text;
  v_count integer := 0;
  v_event text;
  v_hash text;
  v_old_name text;
  v_new_name text;
  v_old_type text;
  v_new_type text;
  v_old_nullable jsonb;
  v_new_nullable jsonb;
  v_old_ordinal text;
  v_new_ordinal text;
  v_old_default jsonb;
  v_new_default jsonb;
begin
  for v_new in select value from jsonb_array_elements(coalesce(p_new_columns,'[]'::jsonb)) loop
    v_identity := catalog.discovery_field_identity_key(v_new);
    select value into v_old_match
    from jsonb_array_elements(coalesce(p_old_columns,'[]'::jsonb))
    where catalog.discovery_field_identity_key(value)=v_identity
    limit 1;

    if v_old_match is null then
      v_event := 'FIELD_ADDED';
      v_hash := catalog.catalog_json_hash(jsonb_build_object('revision',p_revision_id,'asset',p_asset_identity_key,'field',v_identity,'event',v_event,'after',v_new));
      insert into catalog.catalog_field_change_events(project_id,source_id,scope_id,revision_id,change_event_id,asset_identity_key,asset_key,field_identity_key,field_name,event_type,before_state,after_state,evidence,event_hash)
      values(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity_key,p_asset_key,v_identity,coalesce(v_new->>'name',''),v_event,null,v_new,jsonb_build_object('matching','FIELD_IDENTITY','authoritative_rename',false),v_hash)
      on conflict(event_hash) do nothing;
      if found then v_count:=v_count+1; end if;
      continue;
    end if;

    v_old_name:=coalesce(v_old_match->>'name',''); v_new_name:=coalesce(v_new->>'name','');
    if v_identity like 'native:%' and lower(v_old_name)<>lower(v_new_name) then
      v_event := 'FIELD_RENAMED';
      v_hash := catalog.catalog_json_hash(jsonb_build_object('revision',p_revision_id,'asset',p_asset_identity_key,'field',v_identity,'event',v_event,'before_name',v_old_name,'after_name',v_new_name));
      insert into catalog.catalog_field_change_events(project_id,source_id,scope_id,revision_id,change_event_id,asset_identity_key,asset_key,field_identity_key,field_name,event_type,before_state,after_state,evidence,event_hash)
      values(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity_key,p_asset_key,v_identity,v_new_name,v_event,v_old_match,v_new,jsonb_build_object('matching','PROVIDER_IMMUTABLE_FIELD_ID','authoritative_rename',true),v_hash)
      on conflict(event_hash) do nothing;
      if found then v_count:=v_count+1; end if;
    end if;

    v_old_type:=coalesce(v_old_match->>'type',v_old_match->>'dataType','');
    v_new_type:=coalesce(v_new->>'type',v_new->>'dataType','');
    if v_old_type is distinct from v_new_type then
      v_event := 'TYPE_CHANGED';
      v_hash := catalog.catalog_json_hash(jsonb_build_object('revision',p_revision_id,'asset',p_asset_identity_key,'field',v_identity,'event',v_event,'before',v_old_type,'after',v_new_type));
      insert into catalog.catalog_field_change_events(project_id,source_id,scope_id,revision_id,change_event_id,asset_identity_key,asset_key,field_identity_key,field_name,event_type,before_state,after_state,evidence,event_hash)
      values(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity_key,p_asset_key,v_identity,v_new_name,v_event,v_old_match,v_new,jsonb_build_object('matching',case when v_identity like 'native:%' then 'PROVIDER_IMMUTABLE_FIELD_ID' else 'FIELD_NAME' end),v_hash)
      on conflict(event_hash) do nothing;
      if found then v_count:=v_count+1; end if;
    end if;

    v_old_nullable:=coalesce(v_old_match->'nullable',v_old_match->'metadata'->'nullable','null'::jsonb);
    v_new_nullable:=coalesce(v_new->'nullable',v_new->'metadata'->'nullable','null'::jsonb);
    if v_old_nullable is distinct from v_new_nullable then
      v_event := 'NULLABILITY_CHANGED';
      v_hash := catalog.catalog_json_hash(jsonb_build_object('revision',p_revision_id,'asset',p_asset_identity_key,'field',v_identity,'event',v_event,'before',v_old_nullable,'after',v_new_nullable));
      insert into catalog.catalog_field_change_events(project_id,source_id,scope_id,revision_id,change_event_id,asset_identity_key,asset_key,field_identity_key,field_name,event_type,before_state,after_state,evidence,event_hash)
      values(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity_key,p_asset_key,v_identity,v_new_name,v_event,v_old_match,v_new,'{"matching":"FIELD_IDENTITY"}'::jsonb,v_hash)
      on conflict(event_hash) do nothing;
      if found then v_count:=v_count+1; end if;
    end if;

    v_old_ordinal:=coalesce(v_old_match->>'ordinal',''); v_new_ordinal:=coalesce(v_new->>'ordinal','');
    if v_old_ordinal is distinct from v_new_ordinal then
      v_event := 'POSITION_CHANGED';
      v_hash := catalog.catalog_json_hash(jsonb_build_object('revision',p_revision_id,'asset',p_asset_identity_key,'field',v_identity,'event',v_event,'before',v_old_ordinal,'after',v_new_ordinal));
      insert into catalog.catalog_field_change_events(project_id,source_id,scope_id,revision_id,change_event_id,asset_identity_key,asset_key,field_identity_key,field_name,event_type,before_state,after_state,evidence,event_hash)
      values(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity_key,p_asset_key,v_identity,v_new_name,v_event,v_old_match,v_new,'{"matching":"FIELD_IDENTITY","materiality_default":"INFORMATIONAL"}'::jsonb,v_hash)
      on conflict(event_hash) do nothing;
      if found then v_count:=v_count+1; end if;
    end if;

    v_old_default:=coalesce(v_old_match->'defaultValue',v_old_match->'metadata'->'default_value','null'::jsonb);
    v_new_default:=coalesce(v_new->'defaultValue',v_new->'metadata'->'default_value','null'::jsonb);
    if v_old_default is distinct from v_new_default then
      v_event := 'DEFAULT_CHANGED';
      v_hash := catalog.catalog_json_hash(jsonb_build_object('revision',p_revision_id,'asset',p_asset_identity_key,'field',v_identity,'event',v_event,'before',v_old_default,'after',v_new_default));
      insert into catalog.catalog_field_change_events(project_id,source_id,scope_id,revision_id,change_event_id,asset_identity_key,asset_key,field_identity_key,field_name,event_type,before_state,after_state,evidence,event_hash)
      values(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity_key,p_asset_key,v_identity,v_new_name,v_event,v_old_match,v_new,'{"matching":"FIELD_IDENTITY"}'::jsonb,v_hash)
      on conflict(event_hash) do nothing;
      if found then v_count:=v_count+1; end if;
    end if;
  end loop;

  for v_old in select value from jsonb_array_elements(coalesce(p_old_columns,'[]'::jsonb)) loop
    v_identity := catalog.discovery_field_identity_key(v_old);
    select value into v_new_match
    from jsonb_array_elements(coalesce(p_new_columns,'[]'::jsonb))
    where catalog.discovery_field_identity_key(value)=v_identity
    limit 1;
    if v_new_match is null then
      v_event := 'FIELD_REMOVED';
      v_hash := catalog.catalog_json_hash(jsonb_build_object('revision',p_revision_id,'asset',p_asset_identity_key,'field',v_identity,'event',v_event,'before',v_old));
      insert into catalog.catalog_field_change_events(project_id,source_id,scope_id,revision_id,change_event_id,asset_identity_key,asset_key,field_identity_key,field_name,event_type,before_state,after_state,evidence,event_hash)
      values(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity_key,p_asset_key,v_identity,coalesce(v_old->>'name',''),v_event,v_old,null,jsonb_build_object('matching','FIELD_IDENTITY','authoritative_rename',false),v_hash)
      on conflict(event_hash) do nothing;
      if found then v_count:=v_count+1; end if;
    end if;
  end loop;
  return v_count;
end
$function$;
revoke all on function catalog.record_field_change_events(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function catalog.record_field_change_events(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,jsonb) to service_role;

-- Backfill normalized identity evidence and a current locator baseline from already-published catalog truth.
insert into catalog.asset_identity_evidence(project_id,source_id,identity_key,provider,provider_object_id,object_kind,evidence_kind,immutable,evidence_source,first_seen_revision_id,last_seen_revision_id)
select ds.project_id,a.source_id,a.identity_key,
       lower(coalesce(nullif(a.metadata->'native_identity'->>'provider',''),nullif(a.metadata->>'database_product',''),'provider')),
       nullif(a.metadata->'native_identity'->>'id',''),
       coalesce(nullif(a.metadata->'native_identity'->>'kind',''),'OBJECT'),
       case when nullif(a.metadata->'native_identity'->>'id','') is not null and coalesce((a.metadata->'native_identity'->>'immutable')::boolean,false) then 'PROVIDER_IMMUTABLE_ID' else 'QUALIFIED_LOCATOR' end,
       coalesce((a.metadata->'native_identity'->>'immutable')::boolean,false),
       jsonb_build_object('native_identity',coalesce(a.metadata->'native_identity','{}'::jsonb),'native_metadata',coalesce(a.metadata->'native_metadata','{}'::jsonb),'backfilled',true),
       s.first_seen_revision_id,s.last_seen_revision_id
from catalog.discovered_assets a
join catalog.data_sources ds on ds.id=a.source_id
left join lateral (
  select min(first_seen_revision_id::text)::uuid as first_seen_revision_id, max(last_seen_revision_id::text)::uuid as last_seen_revision_id
  from catalog.scope_asset_state st where st.source_id=a.source_id and st.identity_key=a.identity_key
) s on true
where a.is_current and a.identity_key is not null
on conflict do nothing;

insert into catalog.asset_locator_history(project_id,source_id,scope_id,identity_key,asset_key,namespace,name,asset_type,valid_from_revision_id,change_kind,evidence)
select st.project_id,st.source_id,st.scope_id,st.identity_key,st.asset_key,a.namespace,a.name,a.asset_type,st.first_seen_revision_id,'OBSERVED',jsonb_build_object('baseline',true,'current_revision_id',st.last_seen_revision_id)
from catalog.scope_asset_state st
join catalog.discovered_assets a on a.id=st.discovered_asset_id
where st.identity_key is not null
on conflict do nothing;

-- Re-baseline current structure hashes under the corrected rule that excludes locator-only field evidence.
update catalog.discovered_assets
set structure_hash=catalog.discovery_structure_hash(asset_type,namespace,name,columns,metadata),
    content_hash=catalog.discovery_structure_hash(asset_type,namespace,name,columns,metadata)
where is_current;

-- Preserve the proven atomic publication implementation as the core, then enrich its result transactionally.
alter function catalog.publish_discovery_revision(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone,text)
  rename to publish_discovery_revision_core;
revoke all on function catalog.publish_discovery_revision_core(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone,text) from public, anon, authenticated, service_role;

create function catalog.publish_discovery_revision(
  p_run_id uuid,
  p_source_id uuid,
  p_scope_id uuid,
  p_scope_version_id uuid,
  p_manifest jsonb,
  p_assets jsonb,
  p_observed_from timestamp with time zone,
  p_observed_to timestamp with time zone,
  p_consistency_mode text default 'BEST_EFFORT'
)
returns jsonb
language plpgsql
security definer
set search_path to 'catalog','public','extensions'
as $function$
declare
  v_before jsonb := '{}'::jsonb;
  v_asset jsonb;
  v_namespace text;
  v_name text;
  v_key text;
  v_identity text;
  v_old catalog.discovered_assets%rowtype;
  v_current catalog.discovered_assets%rowtype;
  v_previous_identity text;
  v_previous_key text;
  v_previous_columns jsonb;
  v_previous_annotation_hash text;
  v_result jsonb;
  v_revision_id uuid;
  v_project_id uuid;
  v_parent_event_id uuid;
  v_has_material_change boolean;
  v_annotation_changed boolean;
  v_field_count integer;
  v_provider text;
  v_provider_id text;
  v_native jsonb;
  v_evidence_kind text;
  v_immutable boolean;
  v_locator_kind text;
  v_change_hash text;
  v_stats catalog.catalog_revisions%rowtype;
begin
  if jsonb_typeof(coalesce(p_assets,'[]'::jsonb)) <> 'array' then raise exception 'p_assets must be an array'; end if;

  -- Capture last-known-good state before the core mutates current rows.
  for v_asset in select value from jsonb_array_elements(p_assets) loop
    v_namespace:=nullif(v_asset->>'namespace','');
    v_name:=v_asset->>'name';
    v_key:=lower(coalesce(v_namespace,'')||'.'||v_name);
    v_identity:=catalog.discovery_identity_key(v_namespace,v_name,coalesce(v_asset->'metadata','{}'::jsonb));
    select * into v_old from catalog.discovered_assets where source_id=p_source_id and identity_key=v_identity and is_current limit 1;
    if not found then select * into v_old from catalog.discovered_assets where source_id=p_source_id and asset_key=v_key and is_current limit 1; end if;
    if found then
      v_before:=v_before || jsonb_build_object(v_identity,jsonb_build_object(
        'id',v_old.id,'identity_key',v_old.identity_key,'asset_key',v_old.asset_key,'columns',coalesce(v_old.columns,'[]'::jsonb),
        'annotation_hash',v_old.source_annotation_hash,'structure_hash',coalesce(v_old.structure_hash,v_old.content_hash)
      ));
    end if;
  end loop;

  v_result:=catalog.publish_discovery_revision_core(p_run_id,p_source_id,p_scope_id,p_scope_version_id,p_manifest,p_assets,p_observed_from,p_observed_to,p_consistency_mode);
  v_revision_id:=(v_result->>'revision_id')::uuid;
  select project_id into v_project_id from catalog.catalog_revisions where id=v_revision_id;

  for v_asset in select value from jsonb_array_elements(p_assets) loop
    v_namespace:=nullif(v_asset->>'namespace',''); v_name:=v_asset->>'name';
    v_key:=lower(coalesce(v_namespace,'')||'.'||v_name);
    v_identity:=catalog.discovery_identity_key(v_namespace,v_name,coalesce(v_asset->'metadata','{}'::jsonb));
    v_previous_identity:=nullif(v_before->v_identity->>'identity_key','');
    v_previous_key:=nullif(v_before->v_identity->>'asset_key','');
    v_previous_columns:=coalesce(v_before->v_identity->'columns','[]'::jsonb);
    v_previous_annotation_hash:=nullif(v_before->v_identity->>'annotation_hash','');

    select * into v_current from catalog.discovered_assets where source_id=p_source_id and identity_key=v_identity and is_current limit 1;
    if not found then select * into v_current from catalog.discovered_assets where source_id=p_source_id and asset_key=v_key and is_current limit 1; end if;
    if not found then raise exception 'Published current asset missing during identity evidence reconciliation: %',v_key; end if;

    v_native:=case when jsonb_typeof(coalesce(v_current.metadata,'{}'::jsonb)->'native_identity')='object' then v_current.metadata->'native_identity' else '{}'::jsonb end;
    v_provider:=lower(coalesce(nullif(v_native->>'provider',''),nullif(v_current.metadata->>'database_product',''),'provider'));
    v_provider_id:=nullif(v_native->>'id','');
    v_immutable:=v_provider_id is not null and coalesce((v_native->>'immutable')::boolean,false);
    v_evidence_kind:=case when v_immutable then 'PROVIDER_IMMUTABLE_ID' else 'QUALIFIED_LOCATOR' end;

    insert into catalog.asset_identity_evidence(project_id,source_id,identity_key,provider,provider_object_id,object_kind,evidence_kind,immutable,supersedes_identity_key,evidence_source,first_seen_revision_id,last_seen_revision_id,updated_at)
    values(v_project_id,p_source_id,v_identity,v_provider,v_provider_id,coalesce(nullif(v_native->>'kind',''),'OBJECT'),v_evidence_kind,v_immutable,
      case when v_previous_identity is not null and v_previous_identity<>v_identity then v_previous_identity else null end,
      jsonb_build_object('native_identity',v_native,'native_metadata',coalesce(v_current.metadata->'native_metadata','{}'::jsonb),'asset_key',v_key),v_revision_id,v_revision_id,now())
    on conflict(source_id,identity_key,evidence_kind,coalesce(provider_object_id,'')) do update
      set last_seen_revision_id=excluded.last_seen_revision_id,updated_at=now(),evidence_source=excluded.evidence_source,
          supersedes_identity_key=coalesce(catalog.asset_identity_evidence.supersedes_identity_key,excluded.supersedes_identity_key);

    if v_previous_identity is not null and v_previous_identity<>v_identity then
      update catalog.asset_locator_history set valid_to_revision_id=v_revision_id,change_kind='IDENTITY_PROMOTED'
      where scope_id=p_scope_id and identity_key=v_previous_identity and valid_to_revision_id is null;
    end if;

    if v_previous_key is null then
      insert into catalog.asset_locator_history(project_id,source_id,scope_id,identity_key,asset_key,namespace,name,asset_type,valid_from_revision_id,change_kind,evidence)
      values(v_project_id,p_source_id,p_scope_id,v_identity,v_key,v_current.namespace,v_current.name,v_current.asset_type,v_revision_id,'OBSERVED',jsonb_build_object('identity_evidence',v_evidence_kind))
      on conflict do nothing;
    elsif v_previous_key<>v_key and v_identity like 'native:%' then
      v_locator_kind:=case
        when regexp_replace(v_previous_key,'\.[^.]+$','')<>coalesce(v_current.namespace,'') and regexp_replace(v_previous_key,'^.*\.','')<>lower(v_current.name) then 'MOVED_AND_RENAMED'
        when regexp_replace(v_previous_key,'\.[^.]+$','')<>coalesce(v_current.namespace,'') then 'MOVED'
        else 'RENAMED' end;
      update catalog.asset_locator_history set valid_to_revision_id=v_revision_id
      where scope_id=p_scope_id and identity_key=v_identity and valid_to_revision_id is null;
      insert into catalog.asset_locator_history(project_id,source_id,scope_id,identity_key,asset_key,namespace,name,asset_type,valid_from_revision_id,change_kind,evidence)
      values(v_project_id,p_source_id,p_scope_id,v_identity,v_key,v_current.namespace,v_current.name,v_current.asset_type,v_revision_id,v_locator_kind,
        jsonb_build_object('previous_asset_key',v_previous_key,'current_asset_key',v_key,'identity_evidence',v_evidence_kind))
      on conflict do nothing;
    else
      insert into catalog.asset_locator_history(project_id,source_id,scope_id,identity_key,asset_key,namespace,name,asset_type,valid_from_revision_id,change_kind,evidence)
      select v_project_id,p_source_id,p_scope_id,v_identity,v_key,v_current.namespace,v_current.name,v_current.asset_type,v_revision_id,'OBSERVED',jsonb_build_object('identity_evidence',v_evidence_kind)
      where not exists(select 1 from catalog.asset_locator_history where scope_id=p_scope_id and identity_key=v_identity and valid_to_revision_id is null)
      on conflict do nothing;
    end if;

    -- Defensive truth rule: path changes are factual rename/move only when stable provider identity proves continuity.
    if v_identity not like 'native:%' then
      delete from catalog.catalog_change_events where revision_id=v_revision_id and identity_key=v_identity and change_type in ('RENAMED','MOVED');
    elsif v_previous_key is not null and v_previous_key<>v_key then
      if regexp_replace(v_previous_key,'\.[^.]+$','')=coalesce(v_current.namespace,'') then
        delete from catalog.catalog_change_events where revision_id=v_revision_id and identity_key=v_identity and change_type='MOVED';
      end if;
      if regexp_replace(v_previous_key,'^.*\.','')=lower(v_current.name) then
        delete from catalog.catalog_change_events where revision_id=v_revision_id and identity_key=v_identity and change_type='RENAMED';
      end if;
    end if;

    select id into v_parent_event_id from catalog.catalog_change_events
      where revision_id=v_revision_id and identity_key=v_identity and change_type='CHANGED' limit 1;
    if v_previous_identity is not null then
      v_field_count:=catalog.record_field_change_events(v_project_id,p_source_id,p_scope_id,v_revision_id,v_parent_event_id,v_identity,v_key,v_previous_columns,coalesce(v_current.columns,'[]'::jsonb));
    else
      v_field_count:=0;
    end if;

    v_annotation_changed:=v_previous_identity is not null and v_previous_annotation_hash is distinct from v_current.source_annotation_hash;
    if v_annotation_changed then
      select exists(select 1 from catalog.catalog_change_events where revision_id=v_revision_id and identity_key=v_identity and change_type in ('CHANGED','RESTORED','RENAMED','MOVED')) into v_has_material_change;
      insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,identity_key,change_type,previous_asset_id,current_asset_id,details)
      values(v_project_id,p_source_id,p_scope_id,v_revision_id,v_key,v_identity,'SOURCE_ANNOTATION_CHANGED',(v_before->v_identity->>'id')::uuid,v_current.id,
        jsonb_build_object('previous_annotation_hash',v_previous_annotation_hash,'current_annotation_hash',v_current.source_annotation_hash,'physical_structure_version_unchanged',coalesce(v_before->v_identity->>'structure_hash','')=coalesce(v_current.structure_hash,v_current.content_hash)))
      on conflict(revision_id,asset_key,change_type) do nothing;
      if not v_has_material_change then
        update catalog.catalog_revisions set objects_changed=objects_changed+1,objects_unchanged=greatest(objects_unchanged-1,0) where id=v_revision_id;
        update catalog.discovery_runs set objects_changed=objects_changed+1,objects_unchanged=greatest(objects_unchanged-1,0) where id=p_run_id;
      end if;
    end if;
  end loop;

  select catalog.catalog_json_hash(jsonb_build_object(
    'asset_events',coalesce((select jsonb_agg(jsonb_build_object('identity_key',identity_key,'asset_key',asset_key,'change_type',change_type,'details',details) order by identity_key,asset_key,change_type) from catalog.catalog_change_events where revision_id=v_revision_id),'[]'::jsonb),
    'field_events',coalesce((select jsonb_agg(jsonb_build_object('asset_identity_key',asset_identity_key,'field_identity_key',field_identity_key,'event_type',event_type,'before',before_state,'after',after_state) order by asset_identity_key,field_identity_key,event_type) from catalog.catalog_field_change_events where revision_id=v_revision_id),'[]'::jsonb)
  )) into v_change_hash;
  update catalog.catalog_revisions set change_set_hash=v_change_hash where id=v_revision_id;
  select * into v_stats from catalog.catalog_revisions where id=v_revision_id;
  return v_result || jsonb_build_object('change_set_hash',v_change_hash,'objects_observed',v_stats.objects_observed,'objects_added',v_stats.objects_added,'objects_changed',v_stats.objects_changed,'objects_removed',v_stats.objects_removed,'objects_missing',v_stats.objects_missing,'objects_unchanged',v_stats.objects_unchanged);
end
$function$;

revoke all on function catalog.publish_discovery_revision(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone,text) from public, anon, authenticated;
grant execute on function catalog.publish_discovery_revision(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone,text) to service_role;

create or replace view catalog.catalog_field_change_history
with (security_invoker=true)
as
select r.project_id,r.source_id,r.scope_id,r.revision_number,r.published_at,
       f.id as field_change_event_id,f.change_event_id,f.asset_identity_key,f.asset_key,
       f.field_identity_key,f.field_name,f.event_type,f.before_state,f.after_state,f.evidence,f.event_hash
from catalog.catalog_revisions r
join catalog.catalog_field_change_events f on f.revision_id=r.id;
grant select on catalog.catalog_field_change_history to authenticated, service_role;

comment on table catalog.asset_identity_evidence is 'Normalized, attributable evidence used to establish catalog asset identity. Qualified locators are never treated as immutable provider identity.';
comment on table catalog.asset_locator_history is 'Revision-bounded provider-native locator history for stable catalog identities.';
comment on table catalog.catalog_field_change_events is 'Atomic field-level physical metadata deltas. FIELD_RENAMED requires explicit immutable provider field identity evidence.';
