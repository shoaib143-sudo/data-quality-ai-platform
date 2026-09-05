alter table catalog.discovered_assets add column if not exists identity_key text;
alter table catalog.source_annotation_versions add column if not exists identity_key text;
alter table catalog.scope_asset_state add column if not exists identity_key text;
alter table catalog.scope_asset_state add column if not exists missing_revision_count integer not null default 0;
alter table catalog.catalog_change_events add column if not exists identity_key text;
alter table catalog.discovery_runs add column if not exists durable_job_id uuid;

update catalog.discovered_assets set identity_key='qualified:'||asset_key where identity_key is null;
update catalog.source_annotation_versions set identity_key='qualified:'||asset_key where identity_key is null;
update catalog.scope_asset_state set identity_key='qualified:'||asset_key where identity_key is null;
update catalog.catalog_change_events set identity_key='qualified:'||asset_key where identity_key is null;

create unique index if not exists discovered_assets_one_current_per_source_identity on catalog.discovered_assets(source_id,identity_key) where is_current;
create index if not exists discovered_assets_identity_history_idx on catalog.discovered_assets(source_id,identity_key,version_number desc);
create unique index if not exists source_annotation_versions_one_current_identity on catalog.source_annotation_versions(source_id,identity_key) where is_current;
create unique index if not exists scope_asset_state_identity_uq on catalog.scope_asset_state(scope_id,identity_key);
create index if not exists catalog_change_events_identity_idx on catalog.catalog_change_events(scope_id,identity_key,created_at desc);
create unique index if not exists discovery_runs_durable_job_uq on catalog.discovery_runs(durable_job_id) where durable_job_id is not null;

alter table catalog.catalog_change_events drop constraint if exists catalog_change_events_change_type_check;
alter table catalog.catalog_change_events add constraint catalog_change_events_change_type_check check(change_type in ('ADDED','CHANGED','RESTORED','MISSING','REMOVED','OUT_OF_SCOPE','RENAMED','MOVED','INACCESSIBLE'));

create table if not exists catalog.discovery_staging_assets(
  discovery_run_id uuid not null references catalog.discovery_runs(id) on delete cascade,
  partition_key text not null,
  identity_key text not null,
  asset_key text not null,
  payload jsonb not null,
  staged_at timestamptz not null default now(),
  primary key(discovery_run_id,partition_key,identity_key)
);
create index if not exists discovery_staging_assets_run_idx on catalog.discovery_staging_assets(discovery_run_id,asset_key);
alter table catalog.discovery_staging_assets enable row level security;
revoke all on catalog.discovery_staging_assets from anon,authenticated;

create table if not exists catalog.source_deletion_policies(
  source_id uuid primary key references catalog.data_sources(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  policy_mode text not null default 'MISSING_ONLY' check(policy_mode in ('MISSING_ONLY','CONFIRMED_ABSENCE','PROVIDER_TOMBSTONE')),
  confirmation_revisions integer not null default 2 check(confirmation_revisions between 1 and 100),
  require_same_scope_version boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table catalog.source_deletion_policies enable row level security;
create policy source_deletion_policies_select on catalog.source_deletion_policies for select to authenticated using(app_private.is_project_member(project_id));
grant select on catalog.source_deletion_policies to authenticated;

insert into catalog.source_deletion_policies(source_id,project_id,policy_mode,confirmation_revisions,metadata)
select id,project_id,
       case when lower(coalesce(connection_metadata->>'connection_kind','')) in ('databricks','postgresql','mssql','mysql') then 'CONFIRMED_ABSENCE' else 'MISSING_ONLY' end,
       2,
       jsonb_build_object('seeded_from_connection_kind',coalesce(connection_metadata->>'connection_kind','unknown'))
from catalog.data_sources
on conflict(source_id) do nothing;

create table if not exists catalog.source_discovery_capabilities(
  source_id uuid primary key references catalog.data_sources(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  capabilities jsonb not null default '{}'::jsonb,
  discovered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table catalog.source_discovery_capabilities enable row level security;
create policy source_discovery_capabilities_select on catalog.source_discovery_capabilities for select to authenticated using(app_private.is_project_member(project_id));
grant select on catalog.source_discovery_capabilities to authenticated;

create or replace function catalog.discovery_identity_key(p_namespace text,p_name text,p_metadata jsonb) returns text
language plpgsql immutable set search_path=catalog,public as $$
declare v_native jsonb:=case when jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)->'native_identity')='object' then coalesce(p_metadata,'{}'::jsonb)->'native_identity' else '{}'::jsonb end; v_id text; v_provider text; v_kind text;
begin
  v_id:=nullif(v_native->>'id','');
  if v_id is not null and coalesce((v_native->>'immutable')::boolean,false) then
    v_provider:=lower(coalesce(nullif(v_native->>'provider',''),nullif(coalesce(p_metadata,'{}'::jsonb)->>'database_product',''),'provider'));
    v_kind:=lower(coalesce(nullif(v_native->>'kind',''),'object'));
    return 'native:'||v_provider||':'||v_kind||':'||lower(v_id);
  end if;
  return 'qualified:'||lower(coalesce(p_namespace,'')||'.'||coalesce(p_name,''));
end $$;

create or replace function catalog.reconcile_source_annotation(p_source_id uuid,p_asset_key text,p_run_id uuid,p_seen_at timestamptz,p_columns jsonb,p_metadata jsonb)
returns void language plpgsql security definer set search_path=catalog,public,extensions as $$
declare v_hash text:=catalog.discovery_annotation_hash(p_columns,p_metadata); v_annotations jsonb:=catalog.discovery_source_annotations(p_columns,p_metadata); v_identity text; v_current catalog.source_annotation_versions%rowtype; v_next integer;
begin
  v_identity:=catalog.discovery_identity_key(nullif(regexp_replace(p_asset_key,'\.[^.]+$',''),''),regexp_replace(p_asset_key,'^.*\.',''),p_metadata);
  select * into v_current from catalog.source_annotation_versions where source_id=p_source_id and identity_key=v_identity and is_current for update;
  if not found then select * into v_current from catalog.source_annotation_versions where source_id=p_source_id and asset_key=p_asset_key and is_current for update; end if;
  if found and v_current.annotation_hash=v_hash then
    update catalog.source_annotation_versions set asset_key=p_asset_key,identity_key=v_identity,annotations=v_annotations,last_seen_at=p_seen_at,last_seen_run_id=p_run_id where id=v_current.id;
    return;
  end if;
  if found then update catalog.source_annotation_versions set is_current=false,last_seen_at=greatest(last_seen_at,p_seen_at) where id=v_current.id; end if;
  select coalesce(max(version_number),0)+1 into v_next from catalog.source_annotation_versions where source_id=p_source_id and identity_key=v_identity;
  if v_next=1 then select coalesce(max(version_number),0)+1 into v_next from catalog.source_annotation_versions where source_id=p_source_id and asset_key=p_asset_key; end if;
  insert into catalog.source_annotation_versions(source_id,asset_key,identity_key,version_number,annotation_hash,annotations,is_current,first_seen_at,last_seen_at,last_seen_run_id)
  values(p_source_id,p_asset_key,v_identity,v_next,v_hash,v_annotations,true,p_seen_at,p_seen_at,p_run_id);
end $$;

create or replace function catalog.prepare_discovered_asset_version()
returns trigger language plpgsql security definer set search_path=catalog,public,extensions as $$
declare v_existing catalog.discovered_assets%rowtype; v_now timestamptz:=coalesce(new.discovered_at,now()); v_structure text; v_annotation text; v_identity text; v_has_existing boolean:=false;
begin
  new.asset_key:=lower(coalesce(new.namespace,'')||'.'||new.name);
  v_identity:=catalog.discovery_identity_key(new.namespace,new.name,new.metadata);
  new.identity_key:=v_identity;
  v_structure:=catalog.discovery_structure_hash(new.asset_type,new.namespace,new.name,new.columns,new.metadata);
  v_annotation:=catalog.discovery_annotation_hash(new.columns,new.metadata);
  new.structure_hash:=v_structure;
  new.content_hash:=v_structure;
  new.source_annotation_hash:=v_annotation;
  select * into v_existing from catalog.discovered_assets where source_id=new.source_id and identity_key=v_identity and is_current for update;
  if not found then select * into v_existing from catalog.discovered_assets where source_id=new.source_id and asset_key=new.asset_key and is_current for update; end if;
  v_has_existing:=found;
  perform catalog.reconcile_source_annotation(new.source_id,new.asset_key,new.discovery_run_id,v_now,new.columns,new.metadata);
  if v_has_existing and coalesce(v_existing.structure_hash,v_existing.content_hash)=v_structure and v_existing.asset_key=new.asset_key then
    update catalog.discovered_assets set identity_key=v_identity,last_seen_at=v_now,last_seen_run_id=new.discovery_run_id,metadata=new.metadata,columns=new.columns,source_annotation_hash=v_annotation where id=v_existing.id;
    return null;
  end if;
  if v_has_existing then
    update catalog.discovered_assets set is_current=false,retired_at=v_now where id=v_existing.id;
    new.version_number:=v_existing.version_number+1;
    new.first_seen_at:=v_existing.first_seen_at;
  else
    new.version_number:=coalesce(new.version_number,1);
    new.first_seen_at:=coalesce(new.first_seen_at,v_now);
  end if;
  new.is_current:=true; new.last_seen_at:=v_now; new.last_seen_run_id:=new.discovery_run_id; new.retired_at:=null;
  return new;
end $$;

create or replace function catalog.publish_discovery_revision(
  p_run_id uuid,p_source_id uuid,p_scope_id uuid,p_scope_version_id uuid,p_manifest jsonb,p_assets jsonb,p_observed_from timestamptz,p_observed_to timestamptz,p_consistency_mode text default 'BEST_EFFORT'
) returns jsonb
language plpgsql security definer set search_path=catalog,public,extensions as $$
declare
  v_run catalog.discovery_runs%rowtype; v_scope_version catalog.source_scope_versions%rowtype; v_previous catalog.catalog_revisions%rowtype; v_policy catalog.source_deletion_policies%rowtype;
  v_manifest_id uuid; v_revision_id uuid; v_revision_number integer; v_manifest_hash text; v_change_hash text; v_scope_changed boolean:=false;
  v_asset jsonb; v_type text; v_namespace text; v_name text; v_columns jsonb; v_metadata jsonb; v_key text; v_identity text; v_hash text;
  v_old catalog.discovered_assets%rowtype; v_current catalog.discovered_assets%rowtype; v_state catalog.scope_asset_state%rowtype;
  v_expected_objects integer:=coalesce((p_manifest->>'expected_object_count')::integer,0); v_expected_fields integer:=coalesce((p_manifest->>'expected_field_count')::integer,0); v_observed_objects integer:=coalesce((p_manifest->>'observed_object_count')::integer,0); v_observed_fields integer:=coalesce((p_manifest->>'observed_field_count')::integer,0); v_failed integer:=coalesce((p_manifest->>'failed_item_count')::integer,0); v_complete boolean:=coalesce((p_manifest->>'complete')::boolean,false); v_truncated boolean:=coalesce((p_manifest->>'truncated')::boolean,false);
  v_observed integer:=0; v_fields integer:=0; v_added integer:=0; v_changed integer:=0; v_unchanged integer:=0; v_missing integer:=0; v_removed integer:=0; v_this_changed boolean; v_missing_count integer; v_first_seen uuid;
begin
  if jsonb_typeof(coalesce(p_assets,'[]'::jsonb))<>'array' then raise exception 'p_assets must be an array'; end if;
  select * into v_run from catalog.discovery_runs where id=p_run_id and source_id=p_source_id for update;
  if not found then raise exception 'Discovery run not found for source'; end if;
  if v_run.status<>'RUNNING' then raise exception 'Discovery run is not publishable from status %',v_run.status; end if;
  select * into v_scope_version from catalog.source_scope_versions where id=p_scope_version_id and scope_id=p_scope_id and source_id=p_source_id;
  if not found then raise exception 'Frozen discovery scope version is invalid'; end if;
  if not v_complete or v_truncated or v_failed<>0 or v_expected_objects<>v_observed_objects or v_expected_fields<>v_observed_fields or jsonb_array_length(p_assets)<>v_observed_objects then raise exception 'Discovery manifest is incomplete and cannot be published'; end if;
  select * into v_policy from catalog.source_deletion_policies where source_id=p_source_id;
  if not found then v_policy.policy_mode:='MISSING_ONLY'; v_policy.confirmation_revisions:=2; v_policy.require_same_scope_version:=true; end if;

  perform pg_advisory_xact_lock(hashtextextended('catalog-scope:'||p_scope_id::text,0));
  select * into v_previous from catalog.catalog_revisions where scope_id=p_scope_id order by revision_number desc limit 1;
  v_revision_number:=coalesce(v_previous.revision_number,0)+1;
  v_scope_changed:=v_previous.id is not null and v_previous.scope_version_id<>p_scope_version_id;
  v_manifest_hash:=catalog.catalog_json_hash(jsonb_build_object('scope_version_id',p_scope_version_id,'expected_object_count',v_expected_objects,'expected_field_count',v_expected_fields,'identity_keys',(select coalesce(jsonb_agg(catalog.discovery_identity_key(nullif(value->>'namespace',''),value->>'name',coalesce(value->'metadata','{}'::jsonb)) order by catalog.discovery_identity_key(nullif(value->>'namespace',''),value->>'name',coalesce(value->'metadata','{}'::jsonb))),'[]'::jsonb) from jsonb_array_elements(p_assets))));
  insert into catalog.discovery_manifests(project_id,source_id,scope_id,scope_version_id,discovery_run_id,expected_object_count,expected_field_count,observed_object_count,observed_field_count,failed_item_count,truncated,complete,manifest_hash,consistency_mode,metadata,completed_at)
  values(v_run.project_id,p_source_id,p_scope_id,p_scope_version_id,p_run_id,v_expected_objects,v_expected_fields,v_observed_objects,v_observed_fields,0,false,true,v_manifest_hash,coalesce(nullif(p_consistency_mode,''),'BEST_EFFORT'),coalesce(p_manifest,'{}'::jsonb),p_observed_to) returning id into v_manifest_id;
  insert into catalog.catalog_revisions(project_id,source_id,scope_id,scope_version_id,discovery_run_id,manifest_id,previous_revision_id,revision_number,observed_from,observed_to,consistency_mode,manifest_hash,change_set_hash,metadata)
  values(v_run.project_id,p_source_id,p_scope_id,p_scope_version_id,p_run_id,v_manifest_id,v_previous.id,v_revision_number,p_observed_from,p_observed_to,coalesce(nullif(p_consistency_mode,''),'BEST_EFFORT'),v_manifest_hash,repeat('0',64),jsonb_build_object('scope_changed',v_scope_changed,'deletion_policy',v_policy.policy_mode,'deletion_confirmation_revisions',v_policy.confirmation_revisions)) returning id into v_revision_id;

  for v_asset in select value from jsonb_array_elements(p_assets) loop
    v_type:=coalesce(nullif(v_asset->>'asset_type',''),'OBJECT'); v_namespace:=nullif(v_asset->>'namespace',''); v_name:=v_asset->>'name'; v_columns:=coalesce(v_asset->'columns','[]'::jsonb); v_metadata:=coalesce(v_asset->'metadata','{}'::jsonb);
    if coalesce(v_name,'')='' then raise exception 'Discovered asset has no name'; end if;
    v_key:=lower(coalesce(v_namespace,'')||'.'||v_name); v_identity:=catalog.discovery_identity_key(v_namespace,v_name,v_metadata); v_hash:=catalog.discovery_structure_hash(v_type,v_namespace,v_name,v_columns,v_metadata); v_observed:=v_observed+1; v_fields:=v_fields+jsonb_array_length(v_columns); v_this_changed:=false;
    select * into v_old from catalog.discovered_assets where source_id=p_source_id and identity_key=v_identity and is_current for update;
    if not found then select * into v_old from catalog.discovered_assets where source_id=p_source_id and asset_key=v_key and is_current for update; end if;
    select * into v_state from catalog.scope_asset_state where scope_id=p_scope_id and identity_key=v_identity for update;
    if not found then select * into v_state from catalog.scope_asset_state where scope_id=p_scope_id and asset_key=v_key for update; end if;
    insert into catalog.discovered_assets(discovery_run_id,source_id,asset_type,namespace,name,columns,metadata,discovered_at) values(p_run_id,p_source_id,v_type,v_namespace,v_name,v_columns,v_metadata,p_observed_to);
    select * into v_current from catalog.discovered_assets where source_id=p_source_id and identity_key=v_identity and is_current;
    if not found then select * into v_current from catalog.discovered_assets where source_id=p_source_id and asset_key=v_key and is_current; end if;
    if not found then raise exception 'Current asset did not resolve after publication: %',v_key; end if;

    if v_state.scope_id is null then
      v_added:=v_added+1;
      insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,identity_key,change_type,current_asset_id,details) values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_key,v_identity,'ADDED',v_current.id,jsonb_build_object('structure_hash',v_hash));
      v_first_seen:=v_revision_id;
    else
      v_first_seen:=coalesce(v_state.first_seen_revision_id,v_revision_id);
      if v_state.presence_state<>'ACTIVE' then
        v_this_changed:=true;
        insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,identity_key,change_type,previous_asset_id,current_asset_id,details) values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_key,v_identity,'RESTORED',v_state.discovered_asset_id,v_current.id,jsonb_build_object('previous_presence_state',v_state.presence_state));
      end if;
      if v_state.asset_key<>v_key then
        v_this_changed:=true;
        if regexp_replace(v_state.asset_key,'\.[^.]+$','')<>coalesce(v_namespace,'') then
          insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,identity_key,change_type,previous_asset_id,current_asset_id,details) values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_key,v_identity,'MOVED',v_state.discovered_asset_id,v_current.id,jsonb_build_object('previous_asset_key',v_state.asset_key,'current_asset_key',v_key)) on conflict do nothing;
        end if;
        if regexp_replace(v_state.asset_key,'^.*\.','')<>v_name then
          insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,identity_key,change_type,previous_asset_id,current_asset_id,details) values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_key,v_identity,'RENAMED',v_state.discovered_asset_id,v_current.id,jsonb_build_object('previous_asset_key',v_state.asset_key,'current_asset_key',v_key)) on conflict do nothing;
        end if;
      end if;
      if v_old.id is not null and coalesce(v_old.structure_hash,v_old.content_hash)<>v_hash then
        v_this_changed:=true;
        insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,identity_key,change_type,previous_asset_id,current_asset_id,details) values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_key,v_identity,'CHANGED',v_old.id,v_current.id,jsonb_build_object('previous_structure_hash',coalesce(v_old.structure_hash,v_old.content_hash),'current_structure_hash',v_hash)) on conflict do nothing;
      end if;
      if v_this_changed then v_changed:=v_changed+1; else v_unchanged:=v_unchanged+1; end if;
      if v_state.asset_key<>v_key then delete from catalog.scope_asset_state where scope_id=p_scope_id and asset_key=v_state.asset_key; end if;
    end if;

    insert into catalog.scope_asset_state(scope_id,project_id,source_id,asset_key,identity_key,discovered_asset_id,presence_state,first_seen_revision_id,last_seen_revision_id,missing_since_revision_id,missing_revision_count,last_seen_at,updated_at)
    values(p_scope_id,v_run.project_id,p_source_id,v_key,v_identity,v_current.id,'ACTIVE',v_first_seen,v_revision_id,null,0,p_observed_to,now())
    on conflict(scope_id,asset_key) do update set identity_key=excluded.identity_key,discovered_asset_id=excluded.discovered_asset_id,presence_state='ACTIVE',last_seen_revision_id=excluded.last_seen_revision_id,missing_since_revision_id=null,missing_revision_count=0,last_seen_at=excluded.last_seen_at,updated_at=now();
  end loop;

  if v_observed<>v_expected_objects or v_fields<>v_expected_fields then raise exception 'Published asset payload does not match manifest counts'; end if;

  for v_state in select * from catalog.scope_asset_state where scope_id=p_scope_id and presence_state in ('ACTIVE','MISSING') and last_seen_revision_id is distinct from v_revision_id for update loop
    if v_scope_changed and v_policy.require_same_scope_version then
      update catalog.scope_asset_state set presence_state='OUT_OF_SCOPE',missing_revision_count=0,updated_at=now() where scope_id=p_scope_id and asset_key=v_state.asset_key;
      insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,identity_key,change_type,previous_asset_id,details) values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_state.asset_key,v_state.identity_key,'OUT_OF_SCOPE',v_state.discovered_asset_id,jsonb_build_object('scope_version_changed',true)) on conflict do nothing;
      continue;
    end if;
    v_missing_count:=case when v_state.presence_state='MISSING' then v_state.missing_revision_count+1 else 1 end;
    if v_policy.policy_mode='CONFIRMED_ABSENCE' and v_missing_count>=v_policy.confirmation_revisions then
      v_removed:=v_removed+1;
      update catalog.scope_asset_state set presence_state='REMOVED',missing_revision_count=v_missing_count,updated_at=now() where scope_id=p_scope_id and asset_key=v_state.asset_key;
      insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,identity_key,change_type,previous_asset_id,details) values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_state.asset_key,v_state.identity_key,'REMOVED',v_state.discovered_asset_id,jsonb_build_object('authoritative_removal_confirmed',true,'confirmation_revisions',v_missing_count,'policy',v_policy.policy_mode)) on conflict do nothing;
    else
      v_missing:=v_missing+1;
      update catalog.scope_asset_state set presence_state='MISSING',missing_since_revision_id=coalesce(missing_since_revision_id,v_revision_id),missing_revision_count=v_missing_count,updated_at=now() where scope_id=p_scope_id and asset_key=v_state.asset_key;
      if v_state.presence_state<>'MISSING' then insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,identity_key,change_type,previous_asset_id,details) values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_state.asset_key,v_state.identity_key,'MISSING',v_state.discovered_asset_id,jsonb_build_object('authoritative_removal_confirmed',false,'missing_revision_count',v_missing_count,'policy',v_policy.policy_mode)) on conflict do nothing; end if;
    end if;
  end loop;

  select catalog.catalog_json_hash(coalesce(jsonb_agg(jsonb_build_object('identity_key',identity_key,'asset_key',asset_key,'change_type',change_type,'details',details) order by identity_key,asset_key,change_type),'[]'::jsonb)) into v_change_hash from catalog.catalog_change_events where revision_id=v_revision_id;
  update catalog.catalog_revisions set change_set_hash=v_change_hash,objects_observed=v_observed,objects_added=v_added,objects_changed=v_changed,objects_removed=v_removed,objects_missing=v_missing,objects_unchanged=v_unchanged where id=v_revision_id;
  update catalog.discovery_runs set status='COMPLETED',assets_discovered=v_observed,objects_observed=v_observed,objects_added=v_added,objects_changed=v_changed,objects_removed=v_removed,objects_missing=v_missing,objects_unchanged=v_unchanged,scope_id=p_scope_id,scope_version_id=p_scope_version_id,manifest_id=v_manifest_id,catalog_revision_id=v_revision_id,observed_from=p_observed_from,observed_to=p_observed_to,consistency_mode=coalesce(nullif(p_consistency_mode,''),'BEST_EFFORT'),completed_at=now() where id=p_run_id;
  delete from catalog.discovery_checkpoints where discovery_run_id=p_run_id;
  delete from catalog.discovery_staging_assets where discovery_run_id=p_run_id;
  return jsonb_build_object('revision_id',v_revision_id,'revision_number',v_revision_number,'manifest_id',v_manifest_id,'objects_observed',v_observed,'objects_added',v_added,'objects_changed',v_changed,'objects_removed',v_removed,'objects_missing',v_missing,'objects_unchanged',v_unchanged,'manifest_hash',v_manifest_hash,'change_set_hash',v_change_hash);
end $$;

create or replace view catalog.discovery_run_progress with (security_invoker=true) as
select r.id discovery_run_id,r.project_id,r.source_id,r.status,r.started_at,r.completed_at,
       count(c.*) checkpoint_count,count(c.*) filter(where c.status='COMPLETED') completed_checkpoints,
       count(s.*) staged_assets
from catalog.discovery_runs r
left join catalog.discovery_checkpoints c on c.discovery_run_id=r.id
left join catalog.discovery_staging_assets s on s.discovery_run_id=r.id
group by r.id;
grant select on catalog.discovery_run_progress to authenticated;

revoke all on function catalog.discovery_identity_key(text,text,jsonb) from public,anon,authenticated;
revoke all on function catalog.publish_discovery_revision(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function catalog.publish_discovery_revision(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamptz,timestamptz,text) to service_role;
