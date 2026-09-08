create table governance.ai_resource_budget_policy_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  scope_type text not null default 'PROJECT' check (scope_type in ('PROJECT','AI_SYSTEM','AGENT')),
  scope_key text not null default 'PROJECT' check (length(btrim(scope_key)) > 0),
  enabled boolean not null default true,
  max_input_tokens_per_request bigint check (max_input_tokens_per_request is null or max_input_tokens_per_request > 0),
  max_output_tokens_per_request bigint check (max_output_tokens_per_request is null or max_output_tokens_per_request > 0),
  max_cost_usd_per_request numeric check (max_cost_usd_per_request is null or max_cost_usd_per_request >= 0),
  max_cost_usd_per_day numeric check (max_cost_usd_per_day is null or max_cost_usd_per_day >= 0),
  max_requests_per_minute integer check (max_requests_per_minute is null or max_requests_per_minute > 0),
  max_concurrent_executions integer check (max_concurrent_executions is null or max_concurrent_executions > 0),
  reviewer_user_id uuid not null references auth.users(id) on delete restrict,
  reviewer_capability text not null default 'policy.approve' check (length(btrim(reviewer_capability)) > 0),
  review_note text not null check (length(btrim(review_note)) > 0),
  created_at timestamptz not null default now(),
  constraint ai_resource_budget_has_limit check (
    max_input_tokens_per_request is not null or
    max_output_tokens_per_request is not null or
    max_cost_usd_per_request is not null or
    max_cost_usd_per_day is not null or
    max_requests_per_minute is not null or
    max_concurrent_executions is not null
  )
);

create index ai_resource_budget_policy_versions_project_scope_created_idx
  on governance.ai_resource_budget_policy_versions(project_id, scope_type, scope_key, created_at desc, id desc);

alter table governance.ai_resource_budget_policy_versions enable row level security;
create policy ai_resource_budget_policy_versions_read
  on governance.ai_resource_budget_policy_versions
  for select
  using (app_private.is_project_member(project_id));

create view governance.ai_resource_budget_policy_effective
with (security_invoker = true)
as
select distinct on (project_id, scope_type, scope_key)
  id, project_id, scope_type, scope_key, enabled,
  max_input_tokens_per_request, max_output_tokens_per_request,
  max_cost_usd_per_request, max_cost_usd_per_day,
  max_requests_per_minute, max_concurrent_executions,
  reviewer_user_id, reviewer_capability, review_note, created_at
from governance.ai_resource_budget_policy_versions
order by project_id, scope_type, scope_key, created_at desc, id desc;

create table governance.ai_execution_control_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  scope_type text not null default 'PROJECT' check (scope_type in ('PROJECT','AI_SYSTEM','AGENT')),
  scope_key text not null default 'PROJECT' check (length(btrim(scope_key)) > 0),
  control_action text not null check (control_action in ('PAUSE','KILL','RESUME')),
  reason text not null check (length(btrim(reason)) > 0),
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  actor_capability text not null default 'admin.manage' check (length(btrim(actor_capability)) > 0),
  correlation_id uuid,
  created_at timestamptz not null default now()
);

create index ai_execution_control_events_project_scope_created_idx
  on governance.ai_execution_control_events(project_id, scope_type, scope_key, created_at desc, id desc);

alter table governance.ai_execution_control_events enable row level security;
create policy ai_execution_control_events_read
  on governance.ai_execution_control_events
  for select
  using (app_private.is_project_member(project_id));

create view governance.ai_execution_control_effective
with (security_invoker = true)
as
select distinct on (project_id, scope_type, scope_key)
  id, project_id, scope_type, scope_key, control_action,
  case control_action when 'RESUME' then 'RUNNING' else control_action end as effective_state,
  reason, actor_user_id, actor_capability, correlation_id, created_at
from governance.ai_execution_control_events
order by project_id, scope_type, scope_key, created_at desc, id desc;

comment on table governance.ai_resource_budget_policy_versions is 'ADR-006 append-only resource budget policy versions. Budget authority is explicit policy evidence and must not be inferred from telemetry.';
comment on view governance.ai_resource_budget_policy_effective is 'Latest recorded ADR-006 resource budget policy per project/scope. This is policy authority, not observed consumption.';
comment on table governance.ai_execution_control_events is 'ADR-006 append-only execution controller events for pause, kill, and resume. These events do not grant model deployment or governance approval authority.';
comment on view governance.ai_execution_control_effective is 'Latest recorded execution-controller state per project/scope. RUNNING means latest event was RESUME; absence of a row means no canonical control state has been recorded.';
