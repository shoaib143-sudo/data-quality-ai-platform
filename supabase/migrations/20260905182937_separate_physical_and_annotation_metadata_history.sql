alter table catalog.discovered_assets
  add column if not exists structure_hash text,
  add column if not exists source_annotation_hash text;

create table if not exists catalog.source_annotation_versions (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  asset_key text not null,
  version_number integer not null check (version_number > 0),
  annotation_hash text not null,
  annotations jsonb not null default '{}'::jsonb,
  is_current boolean not null default true,
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  last_seen_run_id uuid references catalog.discovery_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(source_id,asset_key,version_number)
);
create unique index if not exists source_annotation_versions_one_current
  on catalog.source_annotation_versions(source_id,asset_key) where is_current;
create index if not exists source_annotation_versions_history_idx
  on catalog.source_annotation_versions(source_id,asset_key,version_number desc);

create or replace function catalog.discovery_structure_payload(p_asset_type text,p_namespace text,p_name text,p_columns jsonb,p_metadata jsonb)
returns jsonb language plpgsql immutable set search_path=catalog,public as $$
declare v_metadata jsonb:=coalesce(p_metadata,'{}'::jsonb)-array['row_count','validation_details','validation_errors','validation_warnings','remarks']; v_native jsonb; v_columns jsonb;
begin
  if jsonb_typeof(v_metadata->'native_metadata')='object' then
    v_native:=(v_metadata->'native_metadata')-array['owner','comment','description','tags','labels'];
    v_metadata:=jsonb_set(v_metadata,'{native_metadata}',v_native,true);
  end if;
  select coalesce(jsonb_agg(
    case when jsonb_typeof(value->'metadata')='object'
      then jsonb_set(value,'{metadata}',(value->'metadata')-array['comment','description','tags','labels'],true)
      else value end
    order by coalesce((value->>'ordinal')::integer,2147483647),value->>'name'
  ),'[]'::jsonb) into v_columns
  from jsonb_array_elements(coalesce(p_columns,'[]'::jsonb));
  return jsonb_build_object('asset_type',p_asset_type,'namespace',p_namespace,'name',p_name,'columns',v_columns,'metadata',v_metadata);
end $$;

create or replace function catalog.discovery_structure_hash(p_asset_type text,p_namespace text,p_name text,p_columns jsonb,p_metadata jsonb)
returns text language sql immutable set search_path=catalog,public,extensions as $$
  select encode(extensions.digest(convert_to(catalog.discovery_structure_payload(p_asset_type,p_namespace,p_name,p_columns,p_metadata)::text,'UTF8'),'sha256'),'hex')
$$;

create or replace function catalog.discovery_source_annotations(p_columns jsonb,p_metadata jsonb)
returns jsonb language plpgsql immutable set search_path=catalog,public as $$
declare v_native jsonb:=case when jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)->'native_metadata')='object' then coalesce(p_metadata,'{}'::jsonb)->'native_metadata' else '{}'::jsonb end; v_columns jsonb;
begin
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
    'name',value->>'name',
    'comment',case when jsonb_typeof(value->'metadata')='object' then value->'metadata'->'comment' else null end,
    'description',case when jsonb_typeof(value->'metadata')='object' then value->'metadata'->'description' else null end
  )) order by coalesce((value->>'ordinal')::integer,2147483647),value->>'name'),'[]'::jsonb) into v_columns
  from jsonb_array_elements(coalesce(p_columns,'[]'::jsonb));
  return jsonb_strip_nulls(jsonb_build_object(
    'owner',v_native->'owner',
    'comment',coalesce(v_native->'comment',coalesce(p_metadata,'{}'::jsonb)->'remarks'),
    'description',v_native->'description',
    'tags',coalesce(v_native->'tags',v_native->'labels'),
    'columns',v_columns
  ));
end $$;

create or replace function catalog.discovery_annotation_hash(p_columns jsonb,p_metadata jsonb)
returns text language sql immutable set search_path=catalog,public,extensions as $$
  select encode(extensions.digest(convert_to(catalog.discovery_source_annotations(p_columns,p_metadata)::text,'UTF8'),'sha256'),'hex')
$$;

update catalog.discovered_assets
set structure_hash=catalog.discovery_structure_hash(asset_type,namespace,name,columns,metadata),
    content_hash=catalog.discovery_structure_hash(asset_type,namespace,name,columns,metadata),
    source_annotation_hash=catalog.discovery_annotation_hash(columns,metadata);

with states as (
  select source_id,asset_key,structure_hash,min(discovered_at) first_seen
  from catalog.discovered_assets group by source_id,asset_key,structure_hash
), numbered as (
  select source_id,asset_key,structure_hash,dense_rank() over(partition by source_id,asset_key order by first_seen,structure_hash) version_number
  from states
)
update catalog.discovered_assets a set version_number=n.version_number
from numbered n where n.source_id=a.source_id and n.asset_key=a.asset_key and n.structure_hash=a.structure_hash;

insert into catalog.source_annotation_versions(source_id,asset_key,version_number,annotation_hash,annotations,is_current,first_seen_at,last_seen_at,last_seen_run_id)
select source_id,asset_key,
       row_number() over(partition by source_id,asset_key order by first_seen,annotation_hash)::integer,
       annotation_hash,annotations,
       annotation_hash=latest_hash,
       first_seen,last_seen,last_seen_run_id
from (
  select g.*,
         first_value(annotation_hash) over(partition by source_id,asset_key order by last_seen desc,annotation_hash desc) latest_hash
  from (
    select source_id,asset_key,source_annotation_hash annotation_hash,
           catalog.discovery_source_annotations((array_agg(columns order by discovered_at desc,id desc))[1],(array_agg(metadata order by discovered_at desc,id desc))[1]) annotations,
           min(discovered_at) first_seen,max(coalesce(last_seen_at,discovered_at)) last_seen,
           (array_agg(coalesce(last_seen_run_id,discovery_run_id) order by discovered_at desc,id desc))[1] last_seen_run_id
    from catalog.discovered_assets
    group by source_id,asset_key,source_annotation_hash
  ) g
) h
on conflict(source_id,asset_key,version_number) do nothing;

create or replace function catalog.reconcile_source_annotation(p_source_id uuid,p_asset_key text,p_run_id uuid,p_seen_at timestamptz,p_columns jsonb,p_metadata jsonb)
returns void language plpgsql security definer set search_path=catalog,public,extensions as $$
declare v_hash text:=catalog.discovery_annotation_hash(p_columns,p_metadata); v_annotations jsonb:=catalog.discovery_source_annotations(p_columns,p_metadata); v_current catalog.source_annotation_versions%rowtype; v_next integer;
begin
  select * into v_current from catalog.source_annotation_versions where source_id=p_source_id and asset_key=p_asset_key and is_current for update;
  if found and v_current.annotation_hash=v_hash then
    update catalog.source_annotation_versions set annotations=v_annotations,last_seen_at=p_seen_at,last_seen_run_id=p_run_id where id=v_current.id;
    return;
  end if;
  if found then update catalog.source_annotation_versions set is_current=false,last_seen_at=greatest(last_seen_at,p_seen_at) where id=v_current.id; end if;
  select coalesce(max(version_number),0)+1 into v_next from catalog.source_annotation_versions where source_id=p_source_id and asset_key=p_asset_key;
  insert into catalog.source_annotation_versions(source_id,asset_key,version_number,annotation_hash,annotations,is_current,first_seen_at,last_seen_at,last_seen_run_id)
  values(p_source_id,p_asset_key,v_next,v_hash,v_annotations,true,p_seen_at,p_seen_at,p_run_id);
end $$;

create or replace function catalog.prepare_discovered_asset_version()
returns trigger language plpgsql security definer set search_path=catalog,public,extensions as $$
declare v_existing catalog.discovered_assets%rowtype; v_now timestamptz:=coalesce(new.discovered_at,now()); v_structure text; v_annotation text; v_has_existing boolean:=false;
begin
  new.asset_key:=lower(coalesce(new.namespace,'')||'.'||new.name);
  v_structure:=catalog.discovery_structure_hash(new.asset_type,new.namespace,new.name,new.columns,new.metadata);
  v_annotation:=catalog.discovery_annotation_hash(new.columns,new.metadata);
  new.structure_hash:=v_structure;
  new.content_hash:=v_structure;
  new.source_annotation_hash:=v_annotation;
  select * into v_existing from catalog.discovered_assets where source_id=new.source_id and asset_key=new.asset_key and is_current for update;
  v_has_existing:=found;
  perform catalog.reconcile_source_annotation(new.source_id,new.asset_key,new.discovery_run_id,v_now,new.columns,new.metadata);
  if v_has_existing and coalesce(v_existing.structure_hash,v_existing.content_hash)=v_structure then
    update catalog.discovered_assets
       set last_seen_at=v_now,last_seen_run_id=new.discovery_run_id,metadata=new.metadata,columns=new.columns,source_annotation_hash=v_annotation
     where id=v_existing.id;
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

drop view if exists catalog.discovered_asset_versions;
create view catalog.discovered_asset_versions with (security_invoker=true) as
select distinct on (source_id,asset_key,structure_hash)
  id,source_id,asset_key,asset_type,namespace,name,columns,metadata,structure_hash as content_hash,structure_hash,source_annotation_hash,version_number,is_current,
  min(discovered_at) over(partition by source_id,asset_key,structure_hash) first_seen_at,
  max(coalesce(last_seen_at,discovered_at)) over(partition by source_id,asset_key,structure_hash) last_seen_at,
  last_seen_run_id,retired_at
from catalog.discovered_assets
order by source_id,asset_key,structure_hash,discovered_at desc,id desc;

alter table catalog.source_annotation_versions enable row level security;
create policy source_annotation_versions_select on catalog.source_annotation_versions for select to authenticated using(
  exists(select 1 from catalog.data_sources ds where ds.id=source_id and app_private.is_project_member(ds.project_id))
);
grant select on catalog.source_annotation_versions,catalog.discovered_asset_versions to authenticated;
revoke all on function catalog.reconcile_source_annotation(uuid,text,uuid,timestamptz,jsonb,jsonb) from public,anon,authenticated;
revoke all on function catalog.discovery_structure_payload(text,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function catalog.discovery_structure_hash(text,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function catalog.discovery_source_annotations(jsonb,jsonb) from public,anon,authenticated;
revoke all on function catalog.discovery_annotation_hash(jsonb,jsonb) from public,anon,authenticated;
