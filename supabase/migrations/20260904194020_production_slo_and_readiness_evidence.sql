create table if not exists orchestration.production_slo_policies (
  project_id uuid primary key references app.projects(id) on delete cascade,
  max_api_p95_ms integer not null default 1500 check (max_api_p95_ms between 50 and 60000),
  max_api_p99_ms integer not null default 3000 check (max_api_p99_ms between 50 and 120000),
  max_error_rate numeric not null default 0.01 check (max_error_rate between 0 and 1),
  max_projection_lag_seconds integer not null default 300 check (max_projection_lag_seconds between 0 and 86400),
  max_dead_job_rate numeric not null default 0.01 check (max_dead_job_rate between 0 and 1),
  min_successful_requests integer not null default 20 check (min_successful_requests between 1 and 100000),
  updated_at timestamptz not null default now()
);

create table if not exists orchestration.production_readiness_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  gate_name text not null,
  status text not null check (status in ('PASSED','FAILED','PARTIAL','NOT_ASSESSED')),
  started_at timestamptz not null default now(),
  completed_at timestamptz null,
  evidence jsonb not null default '{}'::jsonb,
  notes text null,
  created_by uuid null,
  created_at timestamptz not null default now()
);
create index if not exists idx_production_readiness_project_gate on orchestration.production_readiness_runs(project_id,gate_name,created_at desc);

alter table orchestration.production_slo_policies enable row level security;
alter table orchestration.production_readiness_runs enable row level security;
drop policy if exists production_slo_select on orchestration.production_slo_policies;
create policy production_slo_select on orchestration.production_slo_policies for select to authenticated using ((select app_private.is_project_member(project_id)));
drop policy if exists production_readiness_select on orchestration.production_readiness_runs;
create policy production_readiness_select on orchestration.production_readiness_runs for select to authenticated using ((select app_private.is_project_member(project_id)));
revoke all on orchestration.production_slo_policies from public,anon,authenticated;
revoke all on orchestration.production_readiness_runs from public,anon,authenticated;
grant select on orchestration.production_slo_policies to authenticated;
grant select on orchestration.production_readiness_runs to authenticated;
grant all on orchestration.production_slo_policies to service_role;
grant all on orchestration.production_readiness_runs to service_role;

insert into orchestration.production_slo_policies(project_id)
select id from app.projects
on conflict (project_id) do nothing;
