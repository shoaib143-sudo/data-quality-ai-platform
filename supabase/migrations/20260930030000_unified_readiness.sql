create schema if not exists governance;

create table if not exists governance.readiness_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  framework_version text not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','SUPERSEDED','COMPLETE')),
  context jsonb not null default '{}'::jsonb,
  target_profile jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists readiness_one_active_cycle
  on governance.readiness_assessments(organization_id, framework_version) where status = 'ACTIVE';

create table if not exists governance.readiness_evidence (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references governance.readiness_assessments(id) on delete cascade,
  capability_id text not null,
  source_type text not null check (source_type in ('SYSTEM','HUMAN','DOCUMENT')),
  source_key text not null,
  maturity smallint not null check (maturity between 0 and 5),
  reliability numeric(5,4) not null check (reliability between 0 and 1),
  observed_at timestamptz not null,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists readiness_evidence_assessment_capability_idx on governance.readiness_evidence(assessment_id, capability_id);
create index if not exists readiness_evidence_expiry_idx on governance.readiness_evidence(assessment_id, expires_at);

create table if not exists governance.readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references governance.readiness_assessments(id) on delete restrict,
  organization_id uuid not null,
  framework_version text not null,
  snapshot jsonb not null,
  supersedes_snapshot_id uuid references governance.readiness_snapshots(id) on delete restrict,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists readiness_snapshot_assessment_idx on governance.readiness_snapshots(assessment_id, created_at desc);

create table if not exists governance.readiness_action_proposals (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references governance.readiness_assessments(id) on delete cascade,
  capability_id text not null,
  status text not null default 'PROPOSED' check (status in ('PROPOSED','AUTHORIZED','REJECTED','EXECUTED','VERIFIED','CLOSED')),
  proposal jsonb not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists readiness_action_assessment_idx on governance.readiness_action_proposals(assessment_id, status);

alter table governance.readiness_assessments enable row level security;
alter table governance.readiness_evidence enable row level security;
alter table governance.readiness_snapshots enable row level security;
alter table governance.readiness_action_proposals enable row level security;

comment on table governance.readiness_snapshots is 'Append-only DN-URA readiness snapshots. Application code must never update or delete historical snapshots.';
comment on table governance.readiness_action_proposals is 'Readiness findings become proposals only. Existing authorization and approval services remain the execution authority.';
