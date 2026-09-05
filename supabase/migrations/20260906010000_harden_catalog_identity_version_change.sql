-- Metadata identity/version/change hardening.
-- Physical source truth remains source-authoritative; DataNexus stores evidence, history and derived change semantics.

create table catalog.asset_identity_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  identity_key text not null,
  provider text not null,
  provider_object_id text,
  object_kind text not null default 'OBJECT',
  evidence_kind text not null check (evidence_kind in ('PROVIDER_IMMUTABLE_ID','PROVIDER_STABLE_ID','QUALIFIED_LOCATOR','IDENTITY_PROMOTION')),
  immutable boolean not null default false,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  supersedes_identity_key text,
  evidence_source jsonb not null default '{}'::jsonb,
  first_seen_revision_id uuid references catalog.catalog_revisions(id) on delete set null,
  last_seen_revision_id uuid references catalog.catalog_revisions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index asset_identity_evidence_unique on catalog.asset_identity_evidence(source_id,identity_key,evidence_kind,(coalesce(provider_object_id,'')));
create index asset_identity_evidence_provider_idx on catalog.asset_identity_evidence(source_id,provider,provider_object_id) where provider_object_id is not null;
create index asset_identity_evidence_identity_idx on catalog.asset_identity_evidence(source_id,identity_key);
alter table catalog.asset_identity_evidence enable row level security;
create policy asset_identity_evidence_select on catalog.asset_identity_evidence for select to authenticated using (app_private.is_project_member(project_id));
revoke all on catalog.asset_identity_evidence from anon, authenticated;
grant select on catalog.asset_identity_evidence to authenticated;
grant all on catalog.asset_identity_evidence to service_role;

create table catalog.asset_locator_history (
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
create unique index asset_locator_history_revision_unique on catalog.asset_locator_history(scope_id,identity_key,valid_from_revision_id);
create unique index asset_locator_history_current_unique on catalog.asset_locator_history(scope_id,identity_key) where valid_to_revision_id is null;
create index asset_locator_history_asset_idx on catalog.asset_locator_history(source_id,asset_key,valid_from_revision_id);
alter table catalog.asset_locator_history enable row level security;
create policy asset_locator_history_select on catalog.asset_locator_history for select to authenticated using (app_private.is_project_member(project_id));
revoke all on catalog.asset_locator_history from anon, authenticated;
grant select on catalog.asset_locator_history to authenticated;
grant all on catalog.asset_locator_history to service_role;

create table catalog.catalog_field_change_events (
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
  event_hash text not null unique,
  created_at timestamptz not null default now()
);
create index catalog_field_change_events_revision_idx on catalog.catalog_field_change_events(revision_id,asset_identity_key,field_name);
alter table catalog.catalog_field_change_events enable row level security;
create policy catalog_field_change_events_select on catalog.catalog_field_change_events for select to authenticated using (app_private.is_project_member(project_id));
revoke all on catalog.catalog_field_change_events from anon, authenticated;
grant select on catalog.catalog_field_change_events to authenticated;
grant all on catalog.catalog_field_change_events to service_role;

alter table catalog.catalog_change_events drop constraint catalog_change_events_change_type_check;
alter table catalog.catalog_change_events add constraint catalog_change_events_change_type_check
  check (change_type in ('ADDED','CHANGED','RESTORED','MISSING','REMOVED','OUT_OF_SCOPE','RENAMED','MOVED','INACCESSIBLE','SOURCE_ANNOTATION_CHANGED'));

create or replace function catalog.discovery_field_identity_key(p_column jsonb)
returns text language plpgsql immutable set search_path to 'catalog','public' as $fn$
declare v_native jsonb; v_id text;
begin
  v_native:=case
    when jsonb_typeof(coalesce(p_column,'{}'::jsonb)->'native_identity')='object' then p_column->'native_identity'
    when jsonb_typeof(coalesce(p_column,'{}'::jsonb)->'metadata'->'native_identity')='object' then p_column->'metadata'->'native_identity'
    else '{}'::jsonb end;
  v_id:=nullif(v_native->>'id','');
  if v_id is not null and coalesce((v_native->>'immutable')::boolean,false) then return 'native:'||lower(v_id); end if;
  return 'name:'||lower(coalesce(p_column->>'name',''));
end $fn$;

-- Field locator evidence (qualified_name/native_id/ordinal-derived IDs) cannot create physical versions by itself.
create or replace function catalog.discovery_structure_payload(p_asset_type text,p_namespace text,p_name text,p_columns jsonb,p_metadata jsonb)
returns jsonb language plpgsql immutable set search_path to 'catalog','public' as $fn$
declare v_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb)-array['row_count','validation_details','validation_errors','validation_warnings','remarks']; v_native jsonb; v_columns jsonb;
begin
  if jsonb_typeof(v_metadata->'native_metadata')='object' then
    v_native:=(v_metadata->'native_metadata')-array['owner','comment','description','tags','labels'];
    v_metadata:=jsonb_set(v_metadata,'{native_metadata}',v_native,true);
  end if;
  select coalesce(jsonb_agg(
    (value-array['native_id','qualified_name','native_identity']) ||
    case when jsonb_typeof(value->'metadata')='object'
      then jsonb_build_object('metadata',(value->'metadata')-array['comment','description','tags','labels','table_id','object_oid','attnum','parent_native_id','identity_evidence','native_identity'])
      else '{}'::jsonb end
    order by coalesce((value->>'ordinal')::integer,2147483647),value->>'name'),'[]'::jsonb)
  into v_columns from jsonb_array_elements(coalesce(p_columns,'[]'::jsonb));
  return jsonb_build_object('asset_type',p_asset_type,'namespace',p_namespace,'name',p_name,'columns',v_columns,'metadata',v_metadata);
end $fn$;

create function catalog.emit_field_change(
  p_project_id uuid,p_source_id uuid,p_scope_id uuid,p_revision_id uuid,p_change_event_id uuid,
  p_asset_identity text,p_asset_key text,p_field_identity text,p_field_name text,p_event_type text,
  p_before jsonb,p_after jsonb,p_evidence jsonb
) returns integer language plpgsql security definer set search_path to 'catalog','public','extensions' as $fn$
declare v_hash text;
begin
  v_hash:=catalog.catalog_json_hash(jsonb_build_object('revision',p_revision_id,'asset',p_asset_identity,'field',p_field_identity,'event',p_event_type,'before',p_before,'after',p_after));
  insert into catalog.catalog_field_change_events(project_id,source_id,scope_id,revision_id,change_event_id,asset_identity_key,asset_key,field_identity_key,field_name,event_type,before_state,after_state,evidence,event_hash)
  values(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity,p_asset_key,p_field_identity,p_field_name,p_event_type,p_before,p_after,coalesce(p_evidence,'{}'::jsonb),v_hash)
  on conflict(event_hash) do nothing;
  return case when found then 1 else 0 end;
end $fn$;
revoke all on function catalog.emit_field_change(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,jsonb,jsonb,jsonb) from public,anon,authenticated;

create function catalog.record_field_change_events(
  p_project_id uuid,p_source_id uuid,p_scope_id uuid,p_revision_id uuid,p_change_event_id uuid,
  p_asset_identity text,p_asset_key text,p_old_columns jsonb,p_new_columns jsonb
) returns integer language plpgsql security definer set search_path to 'catalog','public','extensions' as $fn$
declare o jsonb; n jsonb; m jsonb; k text; c integer:=0; ot text; nt text; onull jsonb; nnull jsonb; oo text; no text; od jsonb; nd jsonb;
begin
  for n in select value from jsonb_array_elements(coalesce(p_new_columns,'[]'::jsonb)) loop
    k:=catalog.discovery_field_identity_key(n); m:=null;
    select value into m from jsonb_array_elements(coalesce(p_old_columns,'[]'::jsonb)) where catalog.discovery_field_identity_key(value)=k limit 1;
    if m is null then
      c:=c+catalog.emit_field_change(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity,p_asset_key,k,coalesce(n->>'name',''),'FIELD_ADDED',null,n,jsonb_build_object('matching','FIELD_IDENTITY','authoritative_rename',false));
      continue;
    end if;
    if k like 'native:%' and lower(coalesce(m->>'name',''))<>lower(coalesce(n->>'name','')) then
      c:=c+catalog.emit_field_change(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity,p_asset_key,k,coalesce(n->>'name',''),'FIELD_RENAMED',m,n,jsonb_build_object('matching','PROVIDER_IMMUTABLE_FIELD_ID','authoritative_rename',true));
    end if;
    ot:=coalesce(m->>'type',m->>'dataType',''); nt:=coalesce(n->>'type',n->>'dataType','');
    if ot is distinct from nt then c:=c+catalog.emit_field_change(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity,p_asset_key,k,coalesce(n->>'name',''),'TYPE_CHANGED',m,n,jsonb_build_object('before_type',ot,'after_type',nt)); end if;
    onull:=coalesce(m->'nullable',m->'metadata'->'nullable','null'::jsonb); nnull:=coalesce(n->'nullable',n->'metadata'->'nullable','null'::jsonb);
    if onull is distinct from nnull then c:=c+catalog.emit_field_change(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity,p_asset_key,k,coalesce(n->>'name',''),'NULLABILITY_CHANGED',m,n,jsonb_build_object('before_nullable',onull,'after_nullable',nnull)); end if;
    oo:=coalesce(m->>'ordinal',''); no:=coalesce(n->>'ordinal','');
    if oo is distinct from no then c:=c+catalog.emit_field_change(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity,p_asset_key,k,coalesce(n->>'name',''),'POSITION_CHANGED',m,n,jsonb_build_object('before_ordinal',oo,'after_ordinal',no,'materiality_default','INFORMATIONAL')); end if;
    od:=coalesce(m->'defaultValue',m->'metadata'->'default_value','null'::jsonb); nd:=coalesce(n->'defaultValue',n->'metadata'->'default_value','null'::jsonb);
    if od is distinct from nd then c:=c+catalog.emit_field_change(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity,p_asset_key,k,coalesce(n->>'name',''),'DEFAULT_CHANGED',m,n,jsonb_build_object('before_default',od,'after_default',nd)); end if;
  end loop;
  for o in select value from jsonb_array_elements(coalesce(p_old_columns,'[]'::jsonb)) loop
    k:=catalog.discovery_field_identity_key(o); m:=null;
    select value into m from jsonb_array_elements(coalesce(p_new_columns,'[]'::jsonb)) where catalog.discovery_field_identity_key(value)=k limit 1;
    if m is null then c:=c+catalog.emit_field_change(p_project_id,p_source_id,p_scope_id,p_revision_id,p_change_event_id,p_asset_identity,p_asset_key,k,coalesce(o->>'name',''),'FIELD_REMOVED',o,null,jsonb_build_object('matching','FIELD_IDENTITY','authoritative_rename',false)); end if;
  end loop;
  return c;
end $fn$;
revoke all on function catalog.record_field_change_events(uuid,uuid,uuid,uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;

-- Establish an evidence/locator baseline for current published state.
insert into catalog.asset_identity_evidence(project_id,source_id,identity_key,provider,provider_object_id,object_kind,evidence_kind,immutable,evidence_source,first_seen_revision_id,last_seen_revision_id)
select ds.project_id,a.source_id,a.identity_key,
  lower(coalesce(nullif(a.metadata->'native_identity'->>'provider',''),nullif(a.metadata->>'database_product',''),'provider')),
  nullif(a.metadata->'native_identity'->>'id',''),coalesce(nullif(a.metadata->'native_identity'->>'kind',''),'OBJECT'),
  case when nullif(a.metadata->'native_identity'->>'id','') is not null and coalesce((a.metadata->'native_identity'->>'immutable')::boolean,false) then 'PROVIDER_IMMUTABLE_ID' else 'QUALIFIED_LOCATOR' end,
  coalesce((a.metadata->'native_identity'->>'immutable')::boolean,false),
  jsonb_build_object('native_identity',coalesce(a.metadata->'native_identity','{}'::jsonb),'native_metadata',coalesce(a.metadata->'native_metadata','{}'::jsonb),'backfilled',true),
  st.first_seen_revision_id,st.last_seen_revision_id
from catalog.discovered_assets a join catalog.data_sources ds on ds.id=a.source_id
left join lateral (select first_seen_revision_id,last_seen_revision_id from catalog.scope_asset_state s where s.source_id=a.source_id and s.identity_key=a.identity_key order by s.updated_at desc limit 1) st on true
where a.is_current and a.identity_key is not null on conflict do nothing;

insert into catalog.asset_locator_history(project_id,source_id,scope_id,identity_key,asset_key,namespace,name,asset_type,valid_from_revision_id,change_kind,evidence)
select s.project_id,s.source_id,s.scope_id,s.identity_key,s.asset_key,a.namespace,a.name,a.asset_type,s.first_seen_revision_id,'OBSERVED',jsonb_build_object('baseline',true,'current_revision_id',s.last_seen_revision_id)
from catalog.scope_asset_state s join catalog.discovered_assets a on a.id=s.discovered_asset_id where s.identity_key is not null on conflict do nothing;

-- Re-baseline only current hashes so corrected field locator semantics do not manufacture a version on the next scan.
update catalog.discovered_assets set
  structure_hash=catalog.discovery_structure_hash(asset_type,namespace,name,columns,metadata),
  content_hash=catalog.discovery_structure_hash(asset_type,namespace,name,columns,metadata)
where is_current;

alter function catalog.publish_discovery_revision(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone,text) rename to publish_discovery_revision_core;
revoke all on function catalog.publish_discovery_revision_core(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone,text) from public,anon,authenticated,service_role;

create function catalog.publish_discovery_revision(
  p_run_id uuid,p_source_id uuid,p_scope_id uuid,p_scope_version_id uuid,p_manifest jsonb,p_assets jsonb,
  p_observed_from timestamp with time zone,p_observed_to timestamp with time zone,p_consistency_mode text default 'BEST_EFFORT'
) returns jsonb language plpgsql security definer set search_path to 'catalog','public','extensions' as $fn$
declare
  before_map jsonb:='{}'::jsonb; a jsonb; ns text; nm text; ak text; ik text; old catalog.discovered_assets%rowtype; cur catalog.discovered_assets%rowtype;
  prev_ik text; prev_ak text; prev_cols jsonb; prev_ann text; result jsonb; rid uuid; pid uuid; parent_event uuid; already_changed boolean; ann_changed boolean;
  native jsonb; provider text; provider_id text; immutable boolean; evidence_kind text; locator_kind text; change_hash text; stats catalog.catalog_revisions%rowtype;
begin
  if jsonb_typeof(coalesce(p_assets,'[]'::jsonb))<>'array' then raise exception 'p_assets must be an array'; end if;
  for a in select value from jsonb_array_elements(p_assets) loop
    ns:=nullif(a->>'namespace',''); nm:=a->>'name'; ak:=lower(coalesce(ns,'')||'.'||nm); ik:=catalog.discovery_identity_key(ns,nm,coalesce(a->'metadata','{}'::jsonb));
    select * into old from catalog.discovered_assets where source_id=p_source_id and identity_key=ik and is_current limit 1;
    if not found then select * into old from catalog.discovered_assets where source_id=p_source_id and asset_key=ak and is_current limit 1; end if;
    if found then before_map:=before_map||jsonb_build_object(ik,jsonb_build_object('id',old.id,'identity_key',old.identity_key,'asset_key',old.asset_key,'columns',coalesce(old.columns,'[]'::jsonb),'annotation_hash',old.source_annotation_hash,'structure_hash',coalesce(old.structure_hash,old.content_hash))); end if;
  end loop;

  result:=catalog.publish_discovery_revision_core(p_run_id,p_source_id,p_scope_id,p_scope_version_id,p_manifest,p_assets,p_observed_from,p_observed_to,p_consistency_mode);
  rid:=(result->>'revision_id')::uuid; select project_id into pid from catalog.catalog_revisions where id=rid;

  for a in select value from jsonb_array_elements(p_assets) loop
    ns:=nullif(a->>'namespace',''); nm:=a->>'name'; ak:=lower(coalesce(ns,'')||'.'||nm); ik:=catalog.discovery_identity_key(ns,nm,coalesce(a->'metadata','{}'::jsonb));
    prev_ik:=nullif(before_map->ik->>'identity_key',''); prev_ak:=nullif(before_map->ik->>'asset_key',''); prev_cols:=coalesce(before_map->ik->'columns','[]'::jsonb); prev_ann:=nullif(before_map->ik->>'annotation_hash','');
    select * into cur from catalog.discovered_assets where source_id=p_source_id and identity_key=ik and is_current limit 1;
    if not found then select * into cur from catalog.discovered_assets where source_id=p_source_id and asset_key=ak and is_current limit 1; end if;
    if not found then raise exception 'Published current asset missing during identity evidence reconciliation: %',ak; end if;

    native:=case when jsonb_typeof(coalesce(cur.metadata,'{}'::jsonb)->'native_identity')='object' then cur.metadata->'native_identity' else '{}'::jsonb end;
    provider:=lower(coalesce(nullif(native->>'provider',''),nullif(cur.metadata->>'database_product',''),'provider')); provider_id:=nullif(native->>'id',''); immutable:=provider_id is not null and coalesce((native->>'immutable')::boolean,false); evidence_kind:=case when immutable then 'PROVIDER_IMMUTABLE_ID' else 'QUALIFIED_LOCATOR' end;
    insert into catalog.asset_identity_evidence(project_id,source_id,identity_key,provider,provider_object_id,object_kind,evidence_kind,immutable,supersedes_identity_key,evidence_source,first_seen_revision_id,last_seen_revision_id,updated_at)
    values(pid,p_source_id,ik,provider,provider_id,coalesce(nullif(native->>'kind',''),'OBJECT'),evidence_kind,immutable,case when prev_ik is not null and prev_ik<>ik then prev_ik end,jsonb_build_object('native_identity',native,'native_metadata',coalesce(cur.metadata->'native_metadata','{}'::jsonb),'asset_key',ak),rid,rid,now())
    on conflict (source_id,identity_key,evidence_kind,(coalesce(provider_object_id,''))) do update set last_seen_revision_id=excluded.last_seen_revision_id,updated_at=now(),evidence_source=excluded.evidence_source,supersedes_identity_key=coalesce(catalog.asset_identity_evidence.supersedes_identity_key,excluded.supersedes_identity_key);

    if prev_ik is not null and prev_ik<>ik then update catalog.asset_locator_history set valid_to_revision_id=rid,change_kind='IDENTITY_PROMOTED' where scope_id=p_scope_id and identity_key=prev_ik and valid_to_revision_id is null; end if;
    if prev_ak is null then
      insert into catalog.asset_locator_history(project_id,source_id,scope_id,identity_key,asset_key,namespace,name,asset_type,valid_from_revision_id,change_kind,evidence) values(pid,p_source_id,p_scope_id,ik,ak,cur.namespace,cur.name,cur.asset_type,rid,'OBSERVED',jsonb_build_object('identity_evidence',evidence_kind)) on conflict do nothing;
    elsif prev_ak<>ak and ik like 'native:%' then
      locator_kind:=case when regexp_replace(prev_ak,'\.[^.]+$','')<>lower(coalesce(cur.namespace,'')) and regexp_replace(prev_ak,'^.*\.','')<>lower(cur.name) then 'MOVED_AND_RENAMED' when regexp_replace(prev_ak,'\.[^.]+$','')<>lower(coalesce(cur.namespace,'')) then 'MOVED' else 'RENAMED' end;
      update catalog.asset_locator_history set valid_to_revision_id=rid where scope_id=p_scope_id and identity_key=ik and valid_to_revision_id is null;
      insert into catalog.asset_locator_history(project_id,source_id,scope_id,identity_key,asset_key,namespace,name,asset_type,valid_from_revision_id,change_kind,evidence) values(pid,p_source_id,p_scope_id,ik,ak,cur.namespace,cur.name,cur.asset_type,rid,locator_kind,jsonb_build_object('previous_asset_key',prev_ak,'current_asset_key',ak,'identity_evidence',evidence_kind)) on conflict do nothing;
    else
      insert into catalog.asset_locator_history(project_id,source_id,scope_id,identity_key,asset_key,namespace,name,asset_type,valid_from_revision_id,change_kind,evidence)
      select pid,p_source_id,p_scope_id,ik,ak,cur.namespace,cur.name,cur.asset_type,rid,'OBSERVED',jsonb_build_object('identity_evidence',evidence_kind)
      where not exists(select 1 from catalog.asset_locator_history where scope_id=p_scope_id and identity_key=ik and valid_to_revision_id is null) on conflict do nothing;
    end if;

    -- Core rename/move events are retained only when immutable provider identity proves continuity.
    if ik not like 'native:%' then delete from catalog.catalog_change_events where revision_id=rid and identity_key=ik and change_type in ('RENAMED','MOVED');
    elsif prev_ak is not null and prev_ak<>ak then
      if regexp_replace(prev_ak,'\.[^.]+$','')=lower(coalesce(cur.namespace,'')) then delete from catalog.catalog_change_events where revision_id=rid and identity_key=ik and change_type='MOVED'; end if;
      if regexp_replace(prev_ak,'^.*\.','')=lower(cur.name) then delete from catalog.catalog_change_events where revision_id=rid and identity_key=ik and change_type='RENAMED'; end if;
    end if;

    select id into parent_event from catalog.catalog_change_events where revision_id=rid and identity_key=ik and change_type='CHANGED' limit 1;
    if prev_ik is not null then perform catalog.record_field_change_events(pid,p_source_id,p_scope_id,rid,parent_event,ik,ak,prev_cols,coalesce(cur.columns,'[]'::jsonb)); end if;

    ann_changed:=prev_ik is not null and prev_ann is distinct from cur.source_annotation_hash;
    if ann_changed then
      select exists(select 1 from catalog.catalog_change_events where revision_id=rid and identity_key=ik and change_type in ('CHANGED','RESTORED','RENAMED','MOVED')) into already_changed;
      insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,identity_key,change_type,previous_asset_id,current_asset_id,details)
      values(pid,p_source_id,p_scope_id,rid,ak,ik,'SOURCE_ANNOTATION_CHANGED',(before_map->ik->>'id')::uuid,cur.id,jsonb_build_object('previous_annotation_hash',prev_ann,'current_annotation_hash',cur.source_annotation_hash,'physical_structure_version_unchanged',coalesce(before_map->ik->>'structure_hash','')=coalesce(cur.structure_hash,cur.content_hash))) on conflict(revision_id,asset_key,change_type) do nothing;
      if not already_changed then update catalog.catalog_revisions set objects_changed=objects_changed+1,objects_unchanged=greatest(objects_unchanged-1,0) where id=rid; update catalog.discovery_runs set objects_changed=objects_changed+1,objects_unchanged=greatest(objects_unchanged-1,0) where id=p_run_id; end if;
    end if;
  end loop;

  select catalog.catalog_json_hash(jsonb_build_object(
    'asset_events',coalesce((select jsonb_agg(jsonb_build_object('identity_key',identity_key,'asset_key',asset_key,'change_type',change_type,'details',details) order by identity_key,asset_key,change_type) from catalog.catalog_change_events where revision_id=rid),'[]'::jsonb),
    'field_events',coalesce((select jsonb_agg(jsonb_build_object('asset_identity_key',asset_identity_key,'field_identity_key',field_identity_key,'event_type',event_type,'before',before_state,'after',after_state) order by asset_identity_key,field_identity_key,event_type) from catalog.catalog_field_change_events where revision_id=rid),'[]'::jsonb))) into change_hash;
  update catalog.catalog_revisions set change_set_hash=change_hash where id=rid; select * into stats from catalog.catalog_revisions where id=rid;
  return result||jsonb_build_object('change_set_hash',change_hash,'objects_observed',stats.objects_observed,'objects_added',stats.objects_added,'objects_changed',stats.objects_changed,'objects_removed',stats.objects_removed,'objects_missing',stats.objects_missing,'objects_unchanged',stats.objects_unchanged);
end $fn$;
revoke all on function catalog.publish_discovery_revision(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone,text) from public,anon,authenticated;
grant execute on function catalog.publish_discovery_revision(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone,text) to service_role;

create view catalog.catalog_field_change_history with (security_invoker=true) as
select r.project_id,r.source_id,r.scope_id,r.revision_number,r.published_at,f.id field_change_event_id,f.change_event_id,f.asset_identity_key,f.asset_key,f.field_identity_key,f.field_name,f.event_type,f.before_state,f.after_state,f.evidence,f.event_hash
from catalog.catalog_revisions r join catalog.catalog_field_change_events f on f.revision_id=r.id;
grant select on catalog.catalog_field_change_history to authenticated,service_role;

comment on table catalog.asset_identity_evidence is 'Normalized evidence used to establish catalog identity; qualified locators are never immutable provider identity.';
comment on table catalog.asset_locator_history is 'Revision-bounded provider-native locator history for stable catalog identities.';
comment on table catalog.catalog_field_change_events is 'Atomic field-level physical metadata deltas. FIELD_RENAMED requires explicit immutable provider field identity evidence.';
