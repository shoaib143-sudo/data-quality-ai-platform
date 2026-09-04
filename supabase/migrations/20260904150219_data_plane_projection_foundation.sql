create table if not exists orchestration.projection_checkpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  consumer_key text not null,
  provider_key text not null,
  projection_name text not null,
  last_checkpoint text,
  last_event_id uuid,
  last_success_at timestamptz,
  lag_seconds bigint,
  last_error text,
  status text not null default 'UNKNOWN',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projection_checkpoints_consumer_key_not_blank check (btrim(consumer_key) <> ''),
  constraint projection_checkpoints_provider_key_not_blank check (btrim(provider_key) <> ''),
  constraint projection_checkpoints_projection_name_not_blank check (btrim(projection_name) <> ''),
  constraint projection_checkpoints_lag_nonnegative check (lag_seconds is null or lag_seconds >= 0),
  constraint projection_checkpoints_status_check check (status in ('HEALTHY','LAGGING','FAILED','PAUSED','UNKNOWN')),
  constraint projection_checkpoints_project_consumer_key unique (project_id, consumer_key)
);

create index if not exists projection_checkpoints_project_provider_idx
  on orchestration.projection_checkpoints (project_id, provider_key, projection_name);
create index if not exists projection_checkpoints_status_idx
  on orchestration.projection_checkpoints (status, updated_at desc);

alter table orchestration.projection_checkpoints enable row level security;
revoke all on table orchestration.projection_checkpoints from anon, authenticated;
grant select on table orchestration.projection_checkpoints to authenticated;
grant all on table orchestration.projection_checkpoints to service_role;

drop policy if exists projection_checkpoints_project_read on orchestration.projection_checkpoints;
create policy projection_checkpoints_project_read
  on orchestration.projection_checkpoints
  for select
  to authenticated
  using (app_private.is_project_member(project_id));

create table if not exists orchestration.projection_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  provider_key text not null,
  projection_name text not null,
  checkpoint text,
  status text not null default 'PENDING',
  expected_count bigint,
  actual_count bigint,
  mismatch_count bigint,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint projection_reconciliation_provider_key_not_blank check (btrim(provider_key) <> ''),
  constraint projection_reconciliation_projection_name_not_blank check (btrim(projection_name) <> ''),
  constraint projection_reconciliation_status_check check (status in ('PENDING','RUNNING','PASSED','FAILED')),
  constraint projection_reconciliation_expected_nonnegative check (expected_count is null or expected_count >= 0),
  constraint projection_reconciliation_actual_nonnegative check (actual_count is null or actual_count >= 0),
  constraint projection_reconciliation_mismatch_nonnegative check (mismatch_count is null or mismatch_count >= 0),
  constraint projection_reconciliation_time_order check (completed_at is null or completed_at >= started_at)
);

create index if not exists projection_reconciliation_project_projection_idx
  on orchestration.projection_reconciliation_runs (project_id, provider_key, projection_name, started_at desc);
create index if not exists projection_reconciliation_status_idx
  on orchestration.projection_reconciliation_runs (status, started_at desc);

alter table orchestration.projection_reconciliation_runs enable row level security;
revoke all on table orchestration.projection_reconciliation_runs from anon, authenticated;
grant select on table orchestration.projection_reconciliation_runs to authenticated;
grant all on table orchestration.projection_reconciliation_runs to service_role;

drop policy if exists projection_reconciliation_project_read on orchestration.projection_reconciliation_runs;
create policy projection_reconciliation_project_read
  on orchestration.projection_reconciliation_runs
  for select
  to authenticated
  using (app_private.is_project_member(project_id));

create index if not exists event_outbox_project_status_created_idx
  on orchestration.event_outbox (project_id, status, created_at desc);

comment on table orchestration.projection_checkpoints is 'Durable per-project consumer checkpoints for rebuildable OpenSearch, ClickHouse, graph, and other data-plane projections.';
comment on table orchestration.projection_reconciliation_runs is 'Per-project projection reconciliation history comparing authoritative PostgreSQL state to rebuildable data-plane projections.';
