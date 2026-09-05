alter table catalog.discovery_runs add column if not exists objects_removed integer not null default 0;
alter table catalog.catalog_revisions add column if not exists objects_removed integer not null default 0;

create or replace function catalog.discovery_content_hash(p_asset_type text,p_namespace text,p_name text,p_columns jsonb,p_metadata jsonb) returns text
language sql immutable set search_path=catalog,public,extensions as $$
  select encode(extensions.digest(convert_to((jsonb_build_object(
    'asset_type',p_asset_type,
    'namespace',p_namespace,
    'name',p_name,
    'columns',coalesce(p_columns,'[]'::jsonb),
    'metadata',coalesce(p_metadata,'{}'::jsonb)-array['row_count','validation_details','validation_errors','validation_warnings']
  ))::text,'UTF8'),'sha256'),'hex')
$$;

create or replace function catalog.prepare_discovered_asset_version() returns trigger
language plpgsql security definer set search_path=catalog,public,extensions as $$
declare v_existing catalog.discovered_assets%rowtype; v_now timestamptz:=coalesce(new.discovered_at,now());
begin
  new.asset_key:=lower(coalesce(new.namespace,'')||'.'||new.name);
  new.content_hash:=catalog.discovery_content_hash(new.asset_type,new.namespace,new.name,new.columns,new.metadata);
  select * into v_existing from catalog.discovered_assets where source_id=new.source_id and asset_key=new.asset_key and is_current for update;
  if found and v_existing.content_hash=new.content_hash then
    update catalog.discovered_assets set last_seen_at=v_now,last_seen_run_id=new.discovery_run_id,metadata=new.metadata,columns=new.columns where id=v_existing.id;
    return null;
  end if;
  if found then
    update catalog.discovered_assets set is_current=false,retired_at=v_now where id=v_existing.id;
    new.version_number:=v_existing.version_number+1;
    new.first_seen_at:=v_existing.first_seen_at;
  else
    new.version_number:=coalesce(new.version_number,1);
    new.first_seen_at:=coalesce(new.first_seen_at,v_now);
  end if;
  new.is_current:=true;
  new.last_seen_at:=v_now;
  new.last_seen_run_id:=new.discovery_run_id;
  new.retired_at:=null;
  return new;
end $$;

create or replace function catalog.publish_discovery_revision(
  p_run_id uuid,
  p_source_id uuid,
  p_scope_id uuid,
  p_scope_version_id uuid,
  p_manifest jsonb,
  p_assets jsonb,
  p_observed_from timestamptz,
  p_observed_to timestamptz,
  p_consistency_mode text default 'BEST_EFFORT'
) returns jsonb
language plpgsql security definer set search_path=catalog,public,extensions as $$
declare
  v_run catalog.discovery_runs%rowtype;
  v_scope_version catalog.source_scope_versions%rowtype;
  v_previous catalog.catalog_revisions%rowtype;
  v_manifest_id uuid;
  v_revision_id uuid;
  v_revision_number integer;
  v_manifest_hash text;
  v_change_hash text;
  v_scope_changed boolean:=false;
  v_asset jsonb;
  v_type text;
  v_namespace text;
  v_name text;
  v_columns jsonb;
  v_metadata jsonb;
  v_key text;
  v_hash text;
  v_old catalog.discovered_assets%rowtype;
  v_current catalog.discovered_assets%rowtype;
  v_state catalog.scope_asset_state%rowtype;
  v_expected_objects integer:=coalesce((p_manifest->>'expected_object_count')::integer,0);
  v_expected_fields integer:=coalesce((p_manifest->>'expected_field_count')::integer,0);
  v_observed_objects integer:=coalesce((p_manifest->>'observed_object_count')::integer,0);
  v_observed_fields integer:=coalesce((p_manifest->>'observed_field_count')::integer,0);
  v_failed integer:=coalesce((p_manifest->>'failed_item_count')::integer,0);
  v_complete boolean:=coalesce((p_manifest->>'complete')::boolean,false);
  v_truncated boolean:=coalesce((p_manifest->>'truncated')::boolean,false);
  v_observed integer:=0;
  v_fields integer:=0;
  v_added integer:=0;
  v_changed integer:=0;
  v_unchanged integer:=0;
  v_missing integer:=0;
  v_this_changed boolean;
begin
  if jsonb_typeof(coalesce(p_assets,'[]'::jsonb))<>'array' then raise exception 'p_assets must be an array'; end if;
  select * into v_run from catalog.discovery_runs where id=p_run_id and source_id=p_source_id for update;
  if not found then raise exception 'Discovery run not found for source'; end if;
  if v_run.status<>'RUNNING' then raise exception 'Discovery run is not publishable from status %',v_run.status; end if;
  select * into v_scope_version from catalog.source_scope_versions where id=p_scope_version_id and scope_id=p_scope_id and source_id=p_source_id;
  if not found then raise exception 'Frozen discovery scope version is invalid'; end if;
  if not v_complete or v_truncated or v_failed<>0 or v_expected_objects<>v_observed_objects or v_expected_fields<>v_observed_fields or jsonb_array_length(p_assets)<>v_observed_objects then
    raise exception 'Discovery manifest is incomplete and cannot be published';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('catalog-scope:'||p_scope_id::text,0));
  select * into v_previous from catalog.catalog_revisions where scope_id=p_scope_id order by revision_number desc limit 1;
  v_revision_number:=coalesce(v_previous.revision_number,0)+1;
  v_scope_changed:=v_previous.id is not null and v_previous.scope_version_id<>p_scope_version_id;
  v_manifest_hash:=catalog.catalog_json_hash(jsonb_build_object(
    'scope_version_id',p_scope_version_id,
    'expected_object_count',v_expected_objects,
    'expected_field_count',v_expected_fields,
    'asset_keys',(select coalesce(jsonb_agg(lower(coalesce(value->>'namespace','')||'.'||coalesce(value->>'name','')) order by lower(coalesce(value->>'namespace','')||'.'||coalesce(value->>'name',''))),'[]'::jsonb) from jsonb_array_elements(p_assets))
  ));

  insert into catalog.discovery_manifests(project_id,source_id,scope_id,scope_version_id,discovery_run_id,expected_object_count,expected_field_count,observed_object_count,observed_field_count,failed_item_count,truncated,complete,manifest_hash,consistency_mode,metadata,completed_at)
  values(v_run.project_id,p_source_id,p_scope_id,p_scope_version_id,p_run_id,v_expected_objects,v_expected_fields,v_observed_objects,v_observed_fields,0,false,true,v_manifest_hash,coalesce(nullif(p_consistency_mode,''),'BEST_EFFORT'),coalesce(p_manifest,'{}'::jsonb),p_observed_to)
  returning id into v_manifest_id;

  insert into catalog.catalog_revisions(project_id,source_id,scope_id,scope_version_id,discovery_run_id,manifest_id,previous_revision_id,revision_number,observed_from,observed_to,consistency_mode,manifest_hash,change_set_hash,metadata)
  values(v_run.project_id,p_source_id,p_scope_id,p_scope_version_id,p_run_id,v_manifest_id,v_previous.id,v_revision_number,p_observed_from,p_observed_to,coalesce(nullif(p_consistency_mode,''),'BEST_EFFORT'),v_manifest_hash,repeat('0',64),jsonb_build_object('scope_changed',v_scope_changed))
  returning id into v_revision_id;

  for v_asset in select value from jsonb_array_elements(p_assets) loop
    v_type:=coalesce(nullif(v_asset->>'asset_type',''),'OBJECT');
    v_namespace:=nullif(v_asset->>'namespace','');
    v_name:=v_asset->>'name';
    v_columns:=coalesce(v_asset->'columns','[]'::jsonb);
    v_metadata:=coalesce(v_asset->'metadata','{}'::jsonb);
    if coalesce(v_name,'')='' then raise exception 'Discovered asset has no name'; end if;
    v_key:=lower(coalesce(v_namespace,'')||'.'||v_name);
    v_hash:=catalog.discovery_content_hash(v_type,v_namespace,v_name,v_columns,v_metadata);
    v_observed:=v_observed+1;
    v_fields:=v_fields+jsonb_array_length(v_columns);
    v_this_changed:=false;

    select * into v_old from catalog.discovered_assets where source_id=p_source_id and asset_key=v_key and is_current for update;
    select * into v_state from catalog.scope_asset_state where scope_id=p_scope_id and asset_key=v_key for update;

    insert into catalog.discovered_assets(discovery_run_id,source_id,asset_type,namespace,name,columns,metadata,discovered_at)
    values(p_run_id,p_source_id,v_type,v_namespace,v_name,v_columns,v_metadata,p_observed_to);
    select * into v_current from catalog.discovered_assets where source_id=p_source_id and asset_key=v_key and is_current;
    if not found then raise exception 'Current asset did not resolve after publication: %',v_key; end if;

    if v_state.scope_id is null then
      v_added:=v_added+1;
      insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,change_type,current_asset_id,details)
      values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_key,'ADDED',v_current.id,jsonb_build_object('content_hash',v_hash));
    elsif v_state.presence_state<>'ACTIVE' then
      v_this_changed:=true;
      insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,change_type,previous_asset_id,current_asset_id,details)
      values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_key,'RESTORED',v_state.discovered_asset_id,v_current.id,jsonb_build_object('previous_presence_state',v_state.presence_state));
    elsif v_old.id is not null and v_old.content_hash<>v_hash then
      v_this_changed:=true;
      insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,change_type,previous_asset_id,current_asset_id,details)
      values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_key,'CHANGED',v_old.id,v_current.id,jsonb_build_object('previous_content_hash',v_old.content_hash,'current_content_hash',v_hash));
    end if;

    insert into catalog.scope_asset_state(scope_id,project_id,source_id,asset_key,discovered_asset_id,presence_state,first_seen_revision_id,last_seen_revision_id,missing_since_revision_id,last_seen_at,updated_at)
    values(p_scope_id,v_run.project_id,p_source_id,v_key,v_current.id,'ACTIVE',v_revision_id,v_revision_id,null,p_observed_to,now())
    on conflict(scope_id,asset_key) do update set discovered_asset_id=excluded.discovered_asset_id,presence_state='ACTIVE',last_seen_revision_id=excluded.last_seen_revision_id,missing_since_revision_id=null,last_seen_at=excluded.last_seen_at,updated_at=now();

    if v_state.scope_id is not null then
      if v_this_changed then v_changed:=v_changed+1; else v_unchanged:=v_unchanged+1; end if;
    end if;
  end loop;

  if v_observed<>v_expected_objects or v_fields<>v_expected_fields then raise exception 'Published asset payload does not match manifest counts'; end if;

  for v_state in select * from catalog.scope_asset_state where scope_id=p_scope_id and presence_state='ACTIVE' and last_seen_revision_id is distinct from v_revision_id for update loop
    if v_scope_changed then
      update catalog.scope_asset_state set presence_state='OUT_OF_SCOPE',updated_at=now() where scope_id=p_scope_id and asset_key=v_state.asset_key;
      insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,change_type,previous_asset_id,details)
      values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_state.asset_key,'OUT_OF_SCOPE',v_state.discovered_asset_id,jsonb_build_object('scope_version_changed',true)) on conflict do nothing;
    else
      v_missing:=v_missing+1;
      update catalog.scope_asset_state set presence_state='MISSING',missing_since_revision_id=v_revision_id,updated_at=now() where scope_id=p_scope_id and asset_key=v_state.asset_key;
      insert into catalog.catalog_change_events(project_id,source_id,scope_id,revision_id,asset_key,change_type,previous_asset_id,details)
      values(v_run.project_id,p_source_id,p_scope_id,v_revision_id,v_state.asset_key,'MISSING',v_state.discovered_asset_id,jsonb_build_object('authoritative_removal_confirmed',false)) on conflict do nothing;
    end if;
  end loop;

  select catalog.catalog_json_hash(coalesce(jsonb_agg(jsonb_build_object('asset_key',asset_key,'change_type',change_type,'details',details) order by asset_key,change_type),'[]'::jsonb)) into v_change_hash from catalog.catalog_change_events where revision_id=v_revision_id;

  update catalog.catalog_revisions set change_set_hash=v_change_hash,objects_observed=v_observed,objects_added=v_added,objects_changed=v_changed,objects_removed=0,objects_missing=v_missing,objects_unchanged=v_unchanged where id=v_revision_id;
  update catalog.discovery_runs set status='COMPLETED',assets_discovered=v_observed,objects_observed=v_observed,objects_added=v_added,objects_changed=v_changed,objects_removed=0,objects_missing=v_missing,objects_unchanged=v_unchanged,scope_id=p_scope_id,scope_version_id=p_scope_version_id,manifest_id=v_manifest_id,catalog_revision_id=v_revision_id,observed_from=p_observed_from,observed_to=p_observed_to,consistency_mode=coalesce(nullif(p_consistency_mode,''),'BEST_EFFORT'),completed_at=now() where id=p_run_id;
  delete from catalog.discovery_checkpoints where discovery_run_id=p_run_id;

  return jsonb_build_object('revision_id',v_revision_id,'revision_number',v_revision_number,'manifest_id',v_manifest_id,'objects_observed',v_observed,'objects_added',v_added,'objects_changed',v_changed,'objects_removed',0,'objects_missing',v_missing,'objects_unchanged',v_unchanged,'manifest_hash',v_manifest_hash,'change_set_hash',v_change_hash);
end $$;

create or replace view catalog.current_catalog_assets as
select s.scope_id,s.presence_state,s.first_seen_revision_id,s.last_seen_revision_id,s.missing_since_revision_id,s.last_seen_at as scope_last_seen_at,a.*
from catalog.scope_asset_state s join catalog.discovered_assets a on a.id=s.discovered_asset_id
where s.presence_state='ACTIVE' and a.is_current;

create or replace view catalog.catalog_revision_changes as
select r.id revision_id,r.project_id,r.source_id,r.scope_id,r.scope_version_id,r.revision_number,r.published_at,r.objects_observed,r.objects_added,r.objects_changed,r.objects_removed,r.objects_missing,r.objects_unchanged,e.id change_event_id,e.asset_key,e.change_type,e.previous_asset_id,e.current_asset_id,e.details
from catalog.catalog_revisions r left join catalog.catalog_change_events e on e.revision_id=r.id;

grant select on catalog.current_catalog_assets,catalog.catalog_revision_changes to authenticated;
revoke all on function catalog.publish_discovery_revision(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamptz,timestamptz,text) from public,anon,authenticated;
grant execute on function catalog.publish_discovery_revision(uuid,uuid,uuid,uuid,jsonb,jsonb,timestamptz,timestamptz,text) to service_role;
revoke all on function catalog.discovery_content_hash(text,text,text,jsonb,jsonb) from public,anon,authenticated;
