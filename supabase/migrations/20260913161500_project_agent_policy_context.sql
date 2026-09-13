-- Governed environment classification for Agent Policy v2.
-- Fail-safe default is PRODUCTION until explicitly classified otherwise.

create table if not exists governance.project_agent_policy_context (
  project_id uuid primary key references app.projects(id) on delete cascade,
  environment text not null default 'PRODUCTION'
    check (environment in ('NON_PRODUCTION','PRODUCTION')),
  policy_version text not null default 'agent-policy-v2.0',
  configured_by uuid references auth.users(id),
  configured_at timestamptz not null default now(),
  reason text
);

insert into governance.project_agent_policy_context (project_id, environment, policy_version, reason)
select p.id, 'PRODUCTION', 'agent-policy-v2.0', 'Fail-safe Agent Policy v2 bootstrap classification.'
from app.projects p
on conflict (project_id) do nothing;

alter table governance.project_agent_policy_context enable row level security;
revoke all on governance.project_agent_policy_context from anon, authenticated;
grant all on governance.project_agent_policy_context to service_role;

comment on table governance.project_agent_policy_context is
  'Server-owned project environment and Agent Policy version. Missing/unknown contexts must be treated as PRODUCTION by application policy.';
