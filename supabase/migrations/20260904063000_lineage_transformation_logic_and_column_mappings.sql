create table if not exists governance.lineage_transformations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  integration_id uuid references governance.lineage_integrations(id) on delete set null,
  external_id text not null,
  source_system text not null,
  name text,
  operation text not null default 'TRANSFORM',
  logic_language text,
  transformation_logic text,
  logic_hash text,
  metadata jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(project_id,integration_id,external_id)
);

create table if not exists governance.lineage_column_mappings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  transformation_id uuid not null references governance.lineage_transformations(id) on delete cascade,
  source_asset_id uuid references governance.lineage_assets(id) on delete set null,
  source_column text,
  target_asset_id uuid references governance.lineage_assets(id) on delete set null,
  target_column text,
  operation text,
  expression text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table governance.lineage_edges add column if not exists transformation_id uuid references governance.lineage_transformations(id) on delete set null;
alter table governance.lineage_ingestion_events add column if not exists transformation_count integer not null default 0;

create index if not exists lineage_transformations_project_idx on governance.lineage_transformations(project_id,last_seen_at desc);
create index if not exists lineage_transformations_logic_hash_idx on governance.lineage_transformations(logic_hash) where logic_hash is not null;
create index if not exists lineage_column_mappings_transformation_idx on governance.lineage_column_mappings(transformation_id);
create index if not exists lineage_edges_transformation_idx on governance.lineage_edges(transformation_id) where transformation_id is not null;

alter table governance.lineage_transformations enable row level security;
alter table governance.lineage_column_mappings enable row level security;
drop policy if exists lineage_transformations_access on governance.lineage_transformations;
create policy lineage_transformations_access on governance.lineage_transformations for select to authenticated using(app_private.is_project_member(project_id));
drop policy if exists lineage_column_mappings_access on governance.lineage_column_mappings;
create policy lineage_column_mappings_access on governance.lineage_column_mappings for select to authenticated using(app_private.is_project_member(project_id));

grant select on governance.lineage_transformations,governance.lineage_column_mappings to authenticated;
grant all on governance.lineage_transformations,governance.lineage_column_mappings to service_role;

comment on column governance.lineage_transformations.transformation_logic is 'Underlying SQL, expression, model, task, notebook, M, DAX, or other transformation logic captured from the lineage source.';
comment on column governance.lineage_edges.transformation_id is 'Transformation operation that explains how the source became the target.';
select pg_notify('pgrst','reload schema');
