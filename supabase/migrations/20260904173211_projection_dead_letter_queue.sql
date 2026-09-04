create table if not exists orchestration.projection_dead_letters (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  consumer_key text not null,
  provider_key text not null,
  projection_name text not null,
  sequence_id bigint not null,
  event_id uuid not null,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  error text not null,
  attempts integer not null default 1,
  first_failed_at timestamptz not null default now(),
  last_failed_at timestamptz not null default now(),
  resolved_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint projection_dead_letters_attempts_positive check (attempts > 0),
  constraint projection_dead_letters_consumer_not_blank check (btrim(consumer_key) <> ''),
  constraint projection_dead_letters_provider_not_blank check (btrim(provider_key) <> ''),
  constraint projection_dead_letters_projection_not_blank check (btrim(projection_name) <> ''),
  constraint projection_dead_letters_project_consumer_event_unique unique (project_id, consumer_key, event_id)
);

create index if not exists projection_dead_letters_unresolved_idx
  on orchestration.projection_dead_letters (project_id, consumer_key, last_failed_at desc)
  where resolved_at is null;
create index if not exists projection_dead_letters_provider_idx
  on orchestration.projection_dead_letters (provider_key, projection_name, last_failed_at desc);

alter table orchestration.projection_dead_letters enable row level security;
revoke all on table orchestration.projection_dead_letters from anon, authenticated;
grant select on table orchestration.projection_dead_letters to authenticated;
grant all on table orchestration.projection_dead_letters to service_role;

drop policy if exists projection_dead_letters_project_read on orchestration.projection_dead_letters;
create policy projection_dead_letters_project_read
  on orchestration.projection_dead_letters
  for select
  to authenticated
  using (app_private.is_project_member(project_id));

comment on table orchestration.projection_dead_letters is 'Durable poison-event ledger for projection consumers. Failed events are retained for operator review/replay without advancing the consumer checkpoint.';
