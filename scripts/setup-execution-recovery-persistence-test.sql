create extension if not exists pgcrypto;

do $do$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end
$do$;

create schema if not exists orchestration;

create table orchestration.job_queue (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  agent_run_id uuid null,
  job_type text not null default 'PROFILING',
  status text not null check (status in ('QUEUED','RUNNING','SUCCEEDED','DEAD')),
  attempts integer not null default 0,
  max_attempts integer not null default 1,
  available_at timestamptz not null default now(),
  lease_owner text null,
  lease_expires_at timestamptz null,
  completed_at timestamptz null,
  payload jsonb not null default '{}'::jsonb,
  last_error text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table orchestration.recovery_cases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null,
  durable_job_id uuid not null references orchestration.job_queue(id) on delete cascade,
  agent_run_id uuid null,
  job_type text not null,
  classification text not null,
  recommended_action text not null check (recommended_action in ('RETRY','MANUAL_REVIEW','ROLLBACK_REVIEW')),
  consent_requirement text not null default 'OPERATOR' check (consent_requirement in ('NONE','OPERATOR')),
  status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','RETRY_QUEUED','AWAITING_MANUAL_REVIEW','RESOLVED')),
  failure_summary text not null default 'synthetic recovery persistence test',
  evidence jsonb not null default '{}'::jsonb,
  occurrence_count integer not null default 1,
  first_detected_at timestamptz not null default now(),
  last_detected_at timestamptz not null default now(),
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint recovery_cases_durable_job_key unique (durable_job_id)
);

create table orchestration.recovery_actions (
  id uuid primary key default gen_random_uuid(),
  recovery_case_id uuid not null references orchestration.recovery_cases(id) on delete cascade,
  project_id uuid not null,
  action_type text not null,
  requested_by uuid null,
  consent_source text not null default 'OPERATOR' check (consent_source in ('SYSTEM','OPERATOR')),
  status text not null check (status in ('EXECUTED','QUEUED','REQUESTED','REJECTED')),
  outcome jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  executed_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint recovery_actions_action_type_check
    check (action_type in ('RETRY','ACKNOWLEDGE','ROLLBACK_REVIEW'))
);

create unique index recovery_actions_one_retry_per_case_idx
  on orchestration.recovery_actions(recovery_case_id)
  where action_type = 'RETRY' and status in ('QUEUED','EXECUTED');
