create table if not exists orchestration.analytics_events (
  event_id uuid primary key,
  project_id uuid not null references app.projects(id) on delete cascade,
  schema_version integer not null,
  event_type text not null,
  occurred_at timestamptz not null,
  aggregate_type text not null,
  aggregate_id text not null,
  aggregate_version text,
  correlation_id text,
  causation_id text,
  actor_type text,
  actor_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint analytics_events_schema_version_positive check (schema_version > 0),
  constraint analytics_events_event_type_not_blank check (btrim(event_type) <> ''),
  constraint analytics_events_aggregate_type_not_blank check (btrim(aggregate_type) <> ''),
  constraint analytics_events_aggregate_id_not_blank check (btrim(aggregate_id) <> '')
);

create index if not exists analytics_events_project_occurred_idx
  on orchestration.analytics_events (project_id, occurred_at desc);
create index if not exists analytics_events_project_type_occurred_idx
  on orchestration.analytics_events (project_id, event_type, occurred_at desc);

alter table orchestration.analytics_events enable row level security;
revoke all on table orchestration.analytics_events from anon, authenticated;
grant all on table orchestration.analytics_events to service_role;

comment on table orchestration.analytics_events is 'Service-only PostgreSQL fallback for analytics events until ClickHouse is selected; authoritative governance state remains in domain tables.';
