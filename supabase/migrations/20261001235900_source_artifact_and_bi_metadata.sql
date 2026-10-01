begin;

create table if not exists governance.source_artifact_scans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  artifact_kind text not null check (artifact_kind in ('DOTNET','NODEJS','VBA','MACRO','SCRIPT','LOG')),
  artifact_path text not null,
  content_hash text not null,
  line_count integer not null default 0 check (line_count >= 0),
  reference_evidence jsonb not null default '[]'::jsonb,
  transformations jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  scanned_by uuid,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(project_id,artifact_kind,artifact_path,content_hash)
);

create index if not exists source_artifact_scans_project_idx
  on governance.source_artifact_scans(project_id,observed_at desc);
create index if not exists source_artifact_scans_path_idx
  on governance.source_artifact_scans(project_id,artifact_path);

create table if not exists governance.bi_metadata_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  provider text not null check (provider in ('POWER_BI','TABLEAU','LOOKER')),
  external_id text not null,
  asset_type text not null check (asset_type in ('WORKSPACE','REPORT','DASHBOARD','SEMANTIC_MODEL','DATASET','FIELD')),
  name text not null,
  container text,
  upstream text[] not null default '{}',
  expression text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,provider,external_id)
);

create index if not exists bi_metadata_assets_project_idx
  on governance.bi_metadata_assets(project_id,last_seen_at desc);
create index if not exists bi_metadata_assets_provider_idx
  on governance.bi_metadata_assets(project_id,provider,asset_type);

alter table governance.source_artifact_scans enable row level security;
alter table governance.bi_metadata_assets enable row level security;

drop policy if exists source_artifact_scans_select on governance.source_artifact_scans;
create policy source_artifact_scans_select on governance.source_artifact_scans
for select to authenticated using(app_private.is_project_member(project_id));

drop policy if exists bi_metadata_assets_select on governance.bi_metadata_assets;
create policy bi_metadata_assets_select on governance.bi_metadata_assets
for select to authenticated using(app_private.is_project_member(project_id));

grant select on governance.source_artifact_scans,governance.bi_metadata_assets to authenticated;
grant all on governance.source_artifact_scans,governance.bi_metadata_assets to service_role;

select pg_notify('pgrst','reload schema');
commit;
