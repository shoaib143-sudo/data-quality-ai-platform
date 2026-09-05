create extension if not exists pgcrypto;

alter table catalog.discovered_assets
  add column if not exists asset_key text,
  add column if not exists content_hash text,
  add column if not exists version_number integer,
  add column if not exists is_current boolean not null default true,
  add column if not exists first_seen_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_seen_run_id uuid references catalog.discovery_runs(id) on delete set null,
  add column if not exists retired_at timestamptz;

update catalog.discovered_assets
set asset_key = lower(coalesce(namespace,'') || '.' || name),
    content_hash = encode(digest(convert_to((jsonb_build_object(
      'asset_type', asset_type,
      'namespace', namespace,
      'name', name,
      'columns', columns,
      'metadata', metadata - array['row_count','validation_details','validation_errors','validation_warnings']
    ))::text, 'UTF8'), 'sha256'), 'hex'),
    first_seen_at = coalesce(first_seen_at, discovered_at),
    last_seen_at = coalesce(last_seen_at, discovered_at),
    last_seen_run_id = coalesce(last_seen_run_id, discovery_run_id)
where asset_key is null or content_hash is null or first_seen_at is null or last_seen_at is null or last_seen_run_id is null;

with ranked as (
  select id,
         row_number() over (partition by source_id, asset_key order by discovered_at desc, id desc) as current_rank,
         row_number() over (partition by source_id, asset_key order by discovered_at asc, id asc) as version_rank
  from catalog.discovered_assets
)
update catalog.discovered_assets a
set is_current = (r.current_rank = 1),
    version_number = coalesce(a.version_number, r.version_rank),
    retired_at = case when r.current_rank = 1 then null else coalesce(a.retired_at, a.last_seen_at, a.discovered_at) end
from ranked r
where a.id = r.id;

alter table catalog.discovered_assets
  alter column asset_key set not null,
  alter column content_hash set not null,
  alter column version_number set not null,
  alter column first_seen_at set not null,
  alter column last_seen_at set not null;

create unique index if not exists discovered_assets_one_current_per_source_asset
  on catalog.discovered_assets(source_id, asset_key)
  where is_current;

create index if not exists discovered_assets_current_source_idx
  on catalog.discovered_assets(source_id, is_current, asset_key);

create or replace function catalog.prepare_discovered_asset_version()
returns trigger
language plpgsql
security definer
set search_path = catalog, public
as $$
declare
  v_existing catalog.discovered_assets%rowtype;
  v_now timestamptz := coalesce(new.discovered_at, now());
  v_stable_metadata jsonb;
begin
  new.asset_key := lower(coalesce(new.namespace,'') || '.' || new.name);
  v_stable_metadata := coalesce(new.metadata,'{}'::jsonb) - array['row_count','validation_details','validation_errors','validation_warnings'];
  new.content_hash := encode(digest(convert_to((jsonb_build_object(
    'asset_type', new.asset_type,
    'namespace', new.namespace,
    'name', new.name,
    'columns', coalesce(new.columns,'[]'::jsonb),
    'metadata', v_stable_metadata
  ))::text, 'UTF8'), 'sha256'), 'hex');

  select * into v_existing
  from catalog.discovered_assets
  where source_id = new.source_id and asset_key = new.asset_key and is_current
  for update;

  if found and v_existing.content_hash = new.content_hash then
    update catalog.discovered_assets
       set last_seen_at = v_now,
           last_seen_run_id = new.discovery_run_id,
           metadata = new.metadata,
           columns = new.columns
     where id = v_existing.id;
    return null;
  end if;

  if found then
    update catalog.discovered_assets
       set is_current = false,
           retired_at = v_now
     where id = v_existing.id;
    new.version_number := v_existing.version_number + 1;
    new.first_seen_at := v_existing.first_seen_at;
  else
    new.version_number := coalesce(new.version_number, 1);
    new.first_seen_at := coalesce(new.first_seen_at, v_now);
  end if;

  new.is_current := true;
  new.last_seen_at := v_now;
  new.last_seen_run_id := new.discovery_run_id;
  new.retired_at := null;
  return new;
end;
$$;

drop trigger if exists discovered_assets_versioning_before_insert on catalog.discovered_assets;
create trigger discovered_assets_versioning_before_insert
before insert on catalog.discovered_assets
for each row execute function catalog.prepare_discovered_asset_version();

create or replace view catalog.current_discovered_assets as
select * from catalog.discovered_assets where is_current;

create or replace view catalog.discovered_asset_versions as
select distinct on (source_id, asset_key, content_hash)
  id,
  source_id,
  asset_key,
  asset_type,
  namespace,
  name,
  columns,
  metadata,
  content_hash,
  version_number,
  is_current,
  min(discovered_at) over (partition by source_id, asset_key, content_hash) as first_seen_at,
  max(coalesce(last_seen_at, discovered_at)) over (partition by source_id, asset_key, content_hash) as last_seen_at,
  last_seen_run_id,
  retired_at
from catalog.discovered_assets
order by source_id, asset_key, content_hash, discovered_at desc, id desc;
