-- Agent Policy v2 foundation: approval, delegation and conversational override persistence.
-- Tables are server-internal initially. Browser roles receive no direct table grants.

create table if not exists governance.agent_approval_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  requested_by uuid not null references auth.users(id),
  domain text not null,
  environment text not null check (environment in ('NON_PRODUCTION','PRODUCTION')),
  action_key text not null,
  target_type text not null,
  target_id text not null,
  risk_level text not null check (risk_level in ('LOW','MEDIUM','HIGH','CRITICAL')),
  business_criticality text not null check (business_criticality in ('STANDARD','IMPORTANT','KDE','CDE')),
  material_production_mutation boolean not null default false,
  execution_fingerprint text not null,
  fingerprint_payload jsonb not null default '{}'::jsonb,
  policy_version text not null,
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED','BUSINESS_PENDING','GOVERNANCE_PENDING','APPROVED','READY_TO_EXECUTE','EXECUTED','REJECTED','CANCELLED','INVALIDATED')),
  sla_due_at timestamptz not null,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  executed_at timestamptz,
  invalidated_at timestamptz,
  invalidation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_agent_approval_requests_project_status
  on governance.agent_approval_requests(project_id, status, requested_at desc);
create index if not exists idx_agent_approval_requests_fingerprint
  on governance.agent_approval_requests(execution_fingerprint);
create index if not exists idx_agent_approval_requests_sla
  on governance.agent_approval_requests(status, sla_due_at)
  where status in ('REQUESTED','BUSINESS_PENDING','GOVERNANCE_PENDING');

create table if not exists governance.agent_approval_decisions (
  id uuid primary key default gen_random_uuid(),
  approval_request_id uuid not null references governance.agent_approval_requests(id) on delete cascade,
  approval_axis text not null check (approval_axis in ('BUSINESS','GOVERNANCE')),
  approver_user_id uuid not null references auth.users(id),
  on_behalf_of_user_id uuid references auth.users(id),
  decision text not null check (decision in ('APPROVED','REJECTED')),
  comment text not null check (length(btrim(comment)) > 0),
  channel text not null check (channel in ('DATANEXUS','EMAIL','TEAMS')),
  decision_context jsonb not null default '{}'::jsonb,
  decided_at timestamptz not null default now()
);

create index if not exists idx_agent_approval_decisions_request
  on governance.agent_approval_decisions(approval_request_id, approval_axis, decided_at desc);
create index if not exists idx_agent_approval_decisions_approver
  on governance.agent_approval_decisions(approver_user_id, decided_at desc);

create table if not exists governance.agent_approval_delegations (
  id uuid primary key default gen_random_uuid(),
  delegator_user_id uuid not null references auth.users(id),
  delegate_user_id uuid not null references auth.users(id),
  domain text not null,
  project_id uuid references app.projects(id) on delete cascade,
  action_keys text[] not null default '{}'::text[],
  max_risk text not null default 'HIGH' check (max_risk in ('LOW','MEDIUM','HIGH','CRITICAL')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  active boolean not null default true,
  reason text not null check (length(btrim(reason)) > 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  revoked_by uuid references auth.users(id),
  revoked_at timestamptz,
  constraint agent_approval_delegation_distinct_users check (delegator_user_id <> delegate_user_id),
  constraint agent_approval_delegation_window check (ends_at is null or ends_at > starts_at)
);

create index if not exists idx_agent_approval_delegations_delegate_scope
  on governance.agent_approval_delegations(delegate_user_id, domain, project_id, active);
create index if not exists idx_agent_approval_delegations_delegator
  on governance.agent_approval_delegations(delegator_user_id, active);

create table if not exists governance.agent_conversation_overrides (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references app.organizations(id) on delete cascade,
  scope_type text not null check (scope_type in ('DOMAIN','PROJECT','USER')),
  persona_slug text,
  domain text,
  project_id uuid references app.projects(id) on delete cascade,
  user_id uuid references auth.users(id),
  settings jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint agent_conversation_override_scope check (
    (scope_type = 'DOMAIN' and domain is not null and project_id is null and user_id is null)
    or (scope_type = 'PROJECT' and project_id is not null and user_id is null)
    or (scope_type = 'USER' and user_id is not null)
  )
);

create index if not exists idx_agent_conversation_overrides_lookup
  on governance.agent_conversation_overrides(organization_id, scope_type, active);

alter table governance.agent_approval_requests enable row level security;
alter table governance.agent_approval_decisions enable row level security;
alter table governance.agent_approval_delegations enable row level security;
alter table governance.agent_conversation_overrides enable row level security;

revoke all on governance.agent_approval_requests from anon, authenticated;
revoke all on governance.agent_approval_decisions from anon, authenticated;
revoke all on governance.agent_approval_delegations from anon, authenticated;
revoke all on governance.agent_conversation_overrides from anon, authenticated;

grant all on governance.agent_approval_requests to service_role;
grant all on governance.agent_approval_decisions to service_role;
grant all on governance.agent_approval_delegations to service_role;
grant all on governance.agent_conversation_overrides to service_role;

comment on table governance.agent_approval_requests is 'Agent Policy v2 approval requests bound to immutable execution fingerprints.';
comment on table governance.agent_approval_decisions is 'Audited Business/Governance approval decisions; comments are mandatory.';
comment on table governance.agent_approval_delegations is 'Individual, scoped approval delegation. Delegates never inherit all delegator authority.';
comment on table governance.agent_conversation_overrides is 'Domain, project and user conversational UX overrides; never an authorization source.';
