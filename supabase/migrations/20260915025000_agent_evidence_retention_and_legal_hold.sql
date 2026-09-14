begin;

create table if not exists agent.evidence_retention_policies (
  project_id uuid primary key references app.projects(id) on delete cascade,
  retention_years integer not null default 7 check (retention_years between 5 and 7),
  active boolean not null default true,
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table agent.agent_artifacts
  add column if not exists retention_until timestamptz;

alter table agent.agent_messages
  add column if not exists retention_until timestamptz;

update agent.agent_artifacts
set retention_until = created_at + interval '7 years'
where retention_until is null;

update agent.agent_messages
set retention_until = created_at + interval '7 years'
where retention_until is null;

alter table agent.agent_artifacts
  alter column retention_until set default (now() + interval '7 years'),
  alter column retention_until set not null;

alter table agent.agent_messages
  alter column retention_until set default (now() + interval '7 years'),
  alter column retention_until set not null;

create table if not exists agent.evidence_legal_holds (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  evidence_type text not null check (evidence_type in ('ARTIFACT','MESSAGE','AUDIT_RECORD')),
  evidence_id uuid not null,
  reason text not null check (length(btrim(reason)) > 0),
  active boolean not null default true,
  placed_by uuid not null references auth.users(id),
  placed_at timestamptz not null default now(),
  released_by uuid null references auth.users(id),
  released_at timestamptz null,
  constraint evidence_legal_holds_release_consistency check (
    (active and released_by is null and released_at is null)
    or
    (not active and released_by is not null and released_at is not null)
  )
);

create unique index if not exists ux_evidence_legal_holds_active
  on agent.evidence_legal_holds(project_id, evidence_type, evidence_id)
  where active;

create index if not exists idx_agent_artifacts_retention
  on agent.agent_artifacts(retention_until);

create index if not exists idx_agent_messages_retention
  on agent.agent_messages(retention_until);

alter table agent.evidence_retention_policies enable row level security;
alter table agent.evidence_legal_holds enable row level security;

revoke all on agent.evidence_retention_policies from anon, authenticated;
revoke all on agent.evidence_legal_holds from anon, authenticated;

grant select, insert, update, delete on agent.evidence_retention_policies to service_role;
grant select, insert, update, delete on agent.evidence_legal_holds to service_role;

commit;
