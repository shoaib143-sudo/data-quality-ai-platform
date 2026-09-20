-- Resumable historical exports over existing authoritative/derived stores.
-- Export jobs are service-managed; portable artifacts remain project-scoped.

alter table orchestration.job_queue drop constraint if exists job_queue_job_type_check;
alter table orchestration.job_queue add constraint job_queue_job_type_check check (
  job_type = any(array[
    'PROFILING'::text,
    'DATA_QUALITY'::text,
    'NOTIFICATION'::text,
    'OBSERVABILITY'::text,
    'DISCOVERY'::text,
    'LINEAGE_ENRICHMENT'::text,
    'SEMANTIC_INDEX'::text,
    'GOVERNANCE_AGENT'::text,
    'EXPORT'::text
  ])
);

create table if not exists orchestration.export_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  export_kind text not null check (
    export_kind in ('AUDIT_EVENTS','ANALYTICS_EVENTS','GOVERNANCE_OUTCOME_REPORTS')
  ),
  status text not null default 'QUEUED' check (
    status in ('QUEUED','RUNNING','COMPLETED','FAILED')
  ),
  filters jsonb not null default '{}'::jsonb check (jsonb_typeof(filters) = 'object'),
  cursor_state jsonb not null default '{}'::jsonb check (jsonb_typeof(cursor_state) = 'object'),
  object_parts jsonb not null default '[]'::jsonb check (jsonb_typeof(object_parts) = 'array'),
  manifest_key text,
  chunk_size integer not null default 500 check (chunk_size between 100 and 2000),
  snapshot_at timestamptz not null default now(),
  part_count integer not null default 0 check (part_count >= 0),
  rows_exported bigint not null default 0 check (rows_exported >= 0),
  idempotency_key text,
  expires_at timestamptz not null default (now() + interval '7 days'),
  last_error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(project_id, idempotency_key)
);

create index if not exists export_jobs_project_created_idx
  on orchestration.export_jobs(project_id, created_at desc);

create index if not exists export_jobs_project_status_idx
  on orchestration.export_jobs(project_id, status, updated_at desc);

alter table orchestration.export_jobs enable row level security;
revoke all on orchestration.export_jobs from public, anon, authenticated;
grant select, insert, update on orchestration.export_jobs to service_role;

comment on table orchestration.export_jobs is
  'Project-scoped resumable historical exports. Each durable EXPORT job writes one bounded NDJSON part to the governed object store and schedules the next cursor page until complete.';
