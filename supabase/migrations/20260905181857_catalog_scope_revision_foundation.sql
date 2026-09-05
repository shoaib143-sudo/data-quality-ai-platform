create extension if not exists pgcrypto;

create table if not exists catalog.source_scopes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  name text not null default 'default',
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RETIRED')),
  current_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_id,name)
);

create table if not exists catalog.source_scope_versions (
  id uuid primary key default gen_random_uuid(),
  scope_id uuid not null references catalog.source_scopes(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  scope_mode text not null default 'DYNAMIC' check (scope_mode in ('DYNAMIC','SNAPSHOT')),
  native_selection jsonb not null default '{}'::jsonb,
  rules jsonb not null default '{}'::jsonb,
  scope_hash text not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  frozen_at timestamptz,
  unique(scope_id,version_number),
  unique(scope_id,scope_hash)
);

alter table catalog.source_scopes drop constraint if exists source_scopes_current_version_id_fkey;
alter table catalog.source_scopes add constraint source_scopes_current_version_id_fkey foreign key(current_version_id) references catalog.source_scope_versions(id) on delete set null;

create table if not exists catalog.discovery_manifests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  scope_id uuid not null references catalog.source_scopes(id) on delete cascade,
  scope_version_id uuid not null references catalog.source_scope_versions(id) on delete restrict,
  discovery_run_id uuid not null references catalog.discovery_runs(id) on delete cascade,
  expected_object_count integer not null default 0 check (expected_object_count >= 0),
  expected_field_count integer not null default 0 check (expected_field_count >= 0),
  observed_object_count integer not null default 0 check (observed_object_count >= 0),
  observed_field_count integer not null default 0 check (observed_field_count >= 0),
  failed_item_count integer not null default 0 check (failed_item_count >= 0),
  truncated boolean not null default false,
  complete boolean not null default false,
  manifest_hash text not null,
  consistency_mode text not null default 'BEST_EFFORT',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique(discovery_run_id)
);

create table if not exists catalog.catalog_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  scope_id uuid not null references catalog.source_scopes(id) on delete cascade,
  scope_version_id uuid not null references catalog.source_scope_versions(id) on delete restrict,
  discovery_run_id uuid references catalog.discovery_runs(id) on delete set null,
  manifest_id uuid references catalog.discovery_manifests(id) on delete restrict,
  previous_revision_id uuid references catalog.catalog_revisions(id) on delete set null,
  revision_number integer not null check (revision_number > 0),
  observed_from timestamptz not null,
  observed_to timestamptz not null,
  published_at timestamptz not null default now(),
  consistency_mode text not null default 'BEST_EFFORT',
  manifest_hash text not null,
  change_set_hash text not null,
  objects_observed integer not null default 0,
  objects_added integer not null default 0,
  objects_changed integer not null default 0,
  objects_missing integer not null default 0,
  objects_unchanged integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  unique(scope_id,revision_number)
);
create unique index if not exists catalog_revisions_discovery_run_uq on catalog.catalog_revisions(discovery_run_id) where discovery_run_id is not null;

create table if not exists catalog.scope_asset_state (
  scope_id uuid not null references catalog.source_scopes(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  asset_key text not null,
  discovered_asset_id uuid references catalog.discovered_assets(id) on delete set null,
  presence_state text not null default 'ACTIVE' check (presence_state in ('ACTIVE','MISSING','REMOVED','OUT_OF_SCOPE','INACCESSIBLE')),
  first_seen_revision_id uuid references catalog.catalog_revisions(id) on delete set null,
  last_seen_revision_id uuid references catalog.catalog_revisions(id) on delete set null,
  missing_since_revision_id uuid references catalog.catalog_revisions(id) on delete set null,
  last_seen_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(scope_id,asset_key)
);

create table if not exists catalog.catalog_change_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  source_id uuid not null references catalog.data_sources(id) on delete cascade,
  scope_id uuid not null references catalog.source_scopes(id) on delete cascade,
  revision_id uuid not null references catalog.catalog_revisions(id) on delete cascade,
  asset_key text not null,
  change_type text not null check (change_type in ('ADDED','CHANGED','RESTORED','MISSING','REMOVED','OUT_OF_SCOPE')),
  previous_asset_id uuid references catalog.discovered_assets(id) on delete set null,
  current_asset_id uuid references catalog.discovered_assets(id) on delete set null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(revision_id,asset_key,change_type)
);

create table if not exists catalog.discovery_checkpoints (
  discovery_run_id uuid not null references catalog.discovery_runs(id) on delete cascade,
  partition_key text not null,
  status text not null default 'PENDING' check (status in ('PENDING','RUNNING','COMPLETED','FAILED')),
  provider_cursor jsonb not null default '{}'::jsonb,
  attempt integer not null default 0,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '24 hours'),
  primary key(discovery_run_id,partition_key)
);

alter table catalog.discovery_runs
  add column if not exists scope_id uuid references catalog.source_scopes(id) on delete set null,
  add column if not exists scope_version_id uuid references catalog.source_scope_versions(id) on delete set null,
  add column if not exists manifest_id uuid references catalog.discovery_manifests(id) on delete set null,
  add column if not exists catalog_revision_id uuid references catalog.catalog_revisions(id) on delete set null,
  add column if not exists observed_from timestamptz,
  add column if not exists observed_to timestamptz,
  add column if not exists objects_observed integer not null default 0,
  add column if not exists objects_added integer not null default 0,
  add column if not exists objects_changed integer not null default 0,
  add column if not exists objects_missing integer not null default 0,
  add column if not exists objects_unchanged integer not null default 0,
  add column if not exists consistency_mode text;

alter table catalog.discovery_runs drop constraint if exists discovery_runs_status_check;
alter table catalog.discovery_runs add constraint discovery_runs_status_check check (status in ('RUNNING','COMPLETED','FAILED','INCOMPLETE'));

create or replace function catalog.catalog_json_hash(p_value jsonb) returns text language sql immutable set search_path=catalog,public,extensions as $$
  select encode(extensions.digest(convert_to(coalesce(p_value,'{}'::jsonb)::text,'UTF8'),'sha256'),'hex')
$$;

insert into catalog.source_scopes(project_id,source_id,name)
select project_id,id,'default' from catalog.data_sources
on conflict(source_id,name) do nothing;

insert into catalog.source_scope_versions(scope_id,project_id,source_id,version_number,scope_mode,native_selection,rules,scope_hash,created_at)
select s.id,s.project_id,s.source_id,1,'DYNAMIC',
       coalesce(ds.connection_metadata->'hierarchy_selection','{"mode":"ALL","nodeIds":[],"qualifiedNames":[]}'::jsonb),
       jsonb_build_object('inherit_future_children',true,'metadata_discovery_field_scope','FULL_OBJECT','selection',coalesce(ds.connection_metadata->'hierarchy_selection','{"mode":"ALL","nodeIds":[],"qualifiedNames":[]}'::jsonb)),
       catalog.catalog_json_hash(jsonb_build_object('scope_mode','DYNAMIC','metadata_discovery_field_scope','FULL_OBJECT','selection',coalesce(ds.connection_metadata->'hierarchy_selection','{"mode":"ALL","nodeIds":[],"qualifiedNames":[]}'::jsonb))),
       coalesce(ds.updated_at,ds.created_at,now())
from catalog.source_scopes s join catalog.data_sources ds on ds.id=s.source_id
where not exists(select 1 from catalog.source_scope_versions v where v.scope_id=s.id);

update catalog.source_scopes s
set current_version_id=(select v.id from catalog.source_scope_versions v where v.scope_id=s.id order by v.version_number desc limit 1), updated_at=now()
where current_version_id is null;

insert into catalog.catalog_revisions(project_id,source_id,scope_id,scope_version_id,revision_number,observed_from,observed_to,published_at,consistency_mode,manifest_hash,change_set_hash,objects_observed,objects_added,objects_changed,objects_missing,objects_unchanged,metadata)
select s.project_id,s.source_id,s.id,s.current_version_id,1,
       coalesce(min(a.first_seen_at),s.created_at),coalesce(max(a.last_seen_at),s.updated_at),now(),'LEGACY_BASELINE',
       catalog.catalog_json_hash(jsonb_build_object('baseline',s.source_id,'scope',s.id)),
       catalog.catalog_json_hash(jsonb_build_object('baseline',s.source_id,'current_assets',count(a.id))),
       count(a.id)::integer,count(a.id)::integer,0,0,0,
       jsonb_build_object('backfilled',true)
from catalog.source_scopes s left join catalog.discovered_assets a on a.source_id=s.source_id and a.is_current
where not exists(select 1 from catalog.catalog_revisions r where r.scope_id=s.id)
group by s.id,s.project_id,s.source_id,s.current_version_id,s.created_at,s.updated_at;

insert into catalog.scope_asset_state(scope_id,project_id,source_id,asset_key,discovered_asset_id,presence_state,first_seen_revision_id,last_seen_revision_id,last_seen_at)
select s.id,s.project_id,s.source_id,a.asset_key,a.id,'ACTIVE',r.id,r.id,a.last_seen_at
from catalog.source_scopes s join catalog.catalog_revisions r on r.scope_id=s.id and r.revision_number=1
join catalog.discovered_assets a on a.source_id=s.source_id and a.is_current
on conflict(scope_id,asset_key) do nothing;

create or replace function catalog.ensure_source_scope_version(p_project_id uuid,p_source_id uuid,p_native_selection jsonb,p_actor uuid default null) returns jsonb
language plpgsql security definer set search_path=catalog,public,extensions as $$
declare v_scope catalog.source_scopes%rowtype; v_current catalog.source_scope_versions%rowtype; v_selection jsonb:=coalesce(p_native_selection,'{"mode":"ALL","nodeIds":[],"qualifiedNames":[]}'::jsonb); v_rules jsonb; v_hash text; v_number integer; v_id uuid;
begin
  perform 1 from catalog.data_sources where id=p_source_id and project_id=p_project_id for update;
  if not found then raise exception 'Source does not belong to project.'; end if;
  insert into catalog.source_scopes(project_id,source_id,name) values(p_project_id,p_source_id,'default') on conflict(source_id,name) do update set updated_at=now() returning * into v_scope;
  v_rules:=jsonb_build_object('inherit_future_children',true,'metadata_discovery_field_scope','FULL_OBJECT','selection',v_selection);
  v_hash:=catalog.catalog_json_hash(jsonb_build_object('scope_mode','DYNAMIC','metadata_discovery_field_scope','FULL_OBJECT','selection',v_selection));
  if v_scope.current_version_id is not null then
    select * into v_current from catalog.source_scope_versions where id=v_scope.current_version_id;
    if found and v_current.scope_hash=v_hash then return jsonb_build_object('scope_id',v_scope.id,'scope_version_id',v_current.id,'version_number',v_current.version_number,'scope_hash',v_hash,'changed',false); end if;
  end if;
  select coalesce(max(version_number),0)+1 into v_number from catalog.source_scope_versions where scope_id=v_scope.id;
  insert into catalog.source_scope_versions(scope_id,project_id,source_id,version_number,scope_mode,native_selection,rules,scope_hash,created_by) values(v_scope.id,p_project_id,p_source_id,v_number,'DYNAMIC',v_selection,v_rules,v_hash,p_actor) returning id into v_id;
  update catalog.source_scopes set current_version_id=v_id,updated_at=now() where id=v_scope.id;
  return jsonb_build_object('scope_id',v_scope.id,'scope_version_id',v_id,'version_number',v_number,'scope_hash',v_hash,'changed',true);
end $$;

create index if not exists source_scope_versions_source_idx on catalog.source_scope_versions(source_id,version_number desc);
create index if not exists catalog_revisions_source_idx on catalog.catalog_revisions(source_id,published_at desc);
create index if not exists catalog_change_events_revision_idx on catalog.catalog_change_events(revision_id,change_type);
create index if not exists scope_asset_state_source_idx on catalog.scope_asset_state(source_id,presence_state,asset_key);
create index if not exists discovery_checkpoints_expiry_idx on catalog.discovery_checkpoints(expires_at);

alter table catalog.source_scopes enable row level security;
alter table catalog.source_scope_versions enable row level security;
alter table catalog.discovery_manifests enable row level security;
alter table catalog.catalog_revisions enable row level security;
alter table catalog.scope_asset_state enable row level security;
alter table catalog.catalog_change_events enable row level security;
alter table catalog.discovery_checkpoints enable row level security;

create policy source_scopes_select on catalog.source_scopes for select to authenticated using(app_private.is_project_member(project_id));
create policy source_scope_versions_select on catalog.source_scope_versions for select to authenticated using(app_private.is_project_member(project_id));
create policy discovery_manifests_select on catalog.discovery_manifests for select to authenticated using(app_private.is_project_member(project_id));
create policy catalog_revisions_select on catalog.catalog_revisions for select to authenticated using(app_private.is_project_member(project_id));
create policy scope_asset_state_select on catalog.scope_asset_state for select to authenticated using(app_private.is_project_member(project_id));
create policy catalog_change_events_select on catalog.catalog_change_events for select to authenticated using(app_private.is_project_member(project_id));

revoke all on catalog.discovery_checkpoints from anon,authenticated;
grant select on catalog.source_scopes,catalog.source_scope_versions,catalog.discovery_manifests,catalog.catalog_revisions,catalog.scope_asset_state,catalog.catalog_change_events to authenticated;
revoke all on function catalog.ensure_source_scope_version(uuid,uuid,jsonb,uuid) from public,anon,authenticated;
grant execute on function catalog.ensure_source_scope_version(uuid,uuid,jsonb,uuid) to service_role;
revoke all on function catalog.catalog_json_hash(jsonb) from public,anon,authenticated;
