-- Cross-dataset observability incident correlation evidence.

create table if not exists governance.observability_incident_correlations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  incident_a_id uuid not null references governance.observability_incidents(id) on delete cascade,
  incident_b_id uuid not null references governance.observability_incidents(id) on delete cascade,
  correlation_type text not null check (correlation_type in ('LINEAGE_RELATED','SHARED_FAILURE_MODE','TEMPORAL_CLUSTER','MULTI_SIGNAL')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ENDED')),
  score numeric not null check (score >= 0 and score <= 1),
  confidence numeric not null check (confidence >= 0 and confidence <= 1),
  evidence jsonb not null default '{}'::jsonb,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (incident_a_id <> incident_b_id),
  unique(project_id,incident_a_id,incident_b_id)
);

create index if not exists observability_incident_correlations_project_idx
  on governance.observability_incident_correlations(project_id,status,last_observed_at desc);
create index if not exists observability_incident_correlations_a_idx
  on governance.observability_incident_correlations(incident_a_id,status);
create index if not exists observability_incident_correlations_b_idx
  on governance.observability_incident_correlations(incident_b_id,status);

alter table governance.observability_incident_correlations enable row level security;

drop policy if exists observability_incident_correlations_read on governance.observability_incident_correlations;
create policy observability_incident_correlations_read on governance.observability_incident_correlations
for select to authenticated using (app_private.is_project_member(project_id));

grant select on governance.observability_incident_correlations to authenticated;
grant all on governance.observability_incident_correlations to service_role;

drop trigger if exists trg_audit_observability_incident_correlations on governance.observability_incident_correlations;
create trigger trg_audit_observability_incident_correlations
  after insert or update or delete on governance.observability_incident_correlations
  for each row execute function governance.audit_project_table_change();

select pg_notify('pgrst','reload schema');
