create table if not exists profiling.observability_alerts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  dataset_version_id uuid references catalog.dataset_versions(id) on delete set null,
  profile_run_id uuid references profiling.profile_runs(id) on delete set null,
  category text not null check (category in ('QUALITY_SCORE_DROP','SCHEMA_DRIFT','VOLUME_CHANGE','QUALITY_RULE_FAILURE','PROFILE_FAILURE','FRESHNESS')),
  severity text not null check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  title text not null,
  description text not null,
  fingerprint text not null,
  evidence jsonb not null default '{}'::jsonb,
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RESOLVED')),
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists observability_alerts_fingerprint_idx
on profiling.observability_alerts(project_id,fingerprint);

create index if not exists observability_alerts_dataset_idx
on profiling.observability_alerts(dataset_id,status,last_observed_at desc);

alter table profiling.observability_alerts enable row level security;

drop policy if exists observability_alerts_select on profiling.observability_alerts;
create policy observability_alerts_select on profiling.observability_alerts
for select to authenticated
using (app_private.is_project_member(project_id));

drop policy if exists observability_alerts_update on profiling.observability_alerts;
create policy observability_alerts_update on profiling.observability_alerts
for update to authenticated
using (app_private.is_project_member(project_id))
with check (app_private.is_project_member(project_id));

grant select,update on profiling.observability_alerts to authenticated;
grant all on profiling.observability_alerts to service_role;

select pg_notify('pgrst','reload schema');
