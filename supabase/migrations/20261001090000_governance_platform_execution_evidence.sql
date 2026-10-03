begin;

create table if not exists governance.platform_execution_checkpoints (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  plan_id text not null,
  operation_id text not null,
  idempotency_key text not null,
  status text not null check (status in ('PENDING','RUNNING','SUCCEEDED','FAILED','VERIFIED')),
  attempts integer not null default 0 check (attempts >= 0),
  provider_object_id text,
  provider_job_id text,
  execution_evidence jsonb not null default '{}'::jsonb,
  verification_status text,
  updated_at timestamptz not null default now(),
  unique (project_id, idempotency_key)
);

create index if not exists platform_execution_checkpoints_plan_idx
  on governance.platform_execution_checkpoints(project_id, plan_id, updated_at desc);

create table if not exists governance.platform_execution_evidence (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  plan_id text not null,
  operation_id text not null,
  provider text not null,
  connection_id text not null,
  idempotency_key text not null,
  desired_state_fingerprint text not null,
  execution_status text not null,
  verification_status text,
  provider_object_id text,
  provider_job_id text,
  details jsonb not null default '{}'::jsonb,
  recorded_at timestamptz not null default now()
);

create index if not exists platform_execution_evidence_plan_idx
  on governance.platform_execution_evidence(project_id, plan_id, recorded_at asc);
create index if not exists platform_execution_evidence_idempotency_idx
  on governance.platform_execution_evidence(project_id, idempotency_key, recorded_at desc);

alter table governance.platform_execution_checkpoints enable row level security;
alter table governance.platform_execution_evidence enable row level security;

revoke all on governance.platform_execution_checkpoints from public, anon, authenticated;
revoke all on governance.platform_execution_evidence from public, anon, authenticated;
grant select, insert, update on governance.platform_execution_checkpoints to service_role;
grant select, insert on governance.platform_execution_evidence to service_role;

comment on table governance.platform_execution_checkpoints is
  'Service-role-only durable checkpoints for idempotent provider-neutral governance execution and verification resume.';
comment on table governance.platform_execution_evidence is
  'Append-only service-role evidence for governance provider execution and verification.';

commit;
