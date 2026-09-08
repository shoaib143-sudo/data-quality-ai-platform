create table governance.ai_telemetry_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  event_type text not null check (length(btrim(event_type)) > 0),
  operation text not null check (length(btrim(operation)) > 0),
  status text not null default 'INFO' check (status in ('INFO','SUCCESS','ERROR')),
  provider_id text,
  model_name text,
  agent_run_id uuid references agent.agent_runs(id) on delete restrict,
  ai_system_id uuid references governance.ai_systems(id) on delete restrict,
  ai_system_version_id uuid references governance.ai_system_versions(id) on delete restrict,
  correlation_id uuid,
  latency_ms integer check (latency_ms is null or latency_ms >= 0),
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  cost_usd numeric(18,8) check (cost_usd is null or cost_usd >= 0),
  attributes jsonb not null default '{}'::jsonb check (jsonb_typeof(attributes) = 'object'),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ai_telemetry_provider_id_nonempty check (provider_id is null or length(btrim(provider_id)) > 0),
  constraint ai_telemetry_model_name_nonempty check (model_name is null or length(btrim(model_name)) > 0)
);

create index ai_telemetry_events_project_observed_idx
  on governance.ai_telemetry_events(project_id, observed_at desc);
create index ai_telemetry_events_agent_run_idx
  on governance.ai_telemetry_events(agent_run_id, observed_at desc)
  where agent_run_id is not null;
create index ai_telemetry_events_ai_system_version_idx
  on governance.ai_telemetry_events(ai_system_version_id, observed_at desc)
  where ai_system_version_id is not null;
create index ai_telemetry_events_correlation_idx
  on governance.ai_telemetry_events(correlation_id, observed_at desc)
  where correlation_id is not null;

alter table governance.ai_telemetry_events enable row level security;

create policy ai_telemetry_events_read
  on governance.ai_telemetry_events
  for select
  to authenticated
  using (app_private.is_project_member(project_id));

revoke all on governance.ai_telemetry_events from anon;
grant select on governance.ai_telemetry_events to authenticated;
grant select, insert on governance.ai_telemetry_events to service_role;

comment on table governance.ai_telemetry_events is
  'Append-only ADR-006 AI runtime telemetry. Stores operational metadata and evidence identifiers, not prompts, completions, or hidden chain-of-thought.';
comment on column governance.ai_telemetry_events.attributes is
  'Structured operational metadata only. Application TelemetryProvider rejects sensitive reasoning/prompt payload keys before persistence.';
