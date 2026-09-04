-- Observability / AI Operations Center
-- Correlates alert signals into governed incidents with deterministic investigation evidence.

create table if not exists governance.observability_incidents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  status text not null default 'OPEN' check (status in ('OPEN','INVESTIGATING','MITIGATING','RESOLVED','ERROR')),
  severity text not null default 'INFO' check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  title text not null,
  summary text not null,
  probable_root_causes jsonb not null default '[]'::jsonb,
  business_impact text,
  risk jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  approval_required boolean not null default false,
  workflow_instance_id uuid references governance.workflow_instances(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  first_observed_at timestamptz not null default now(),
  last_observed_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists observability_incident_active_dataset_unique
  on governance.observability_incidents(project_id,dataset_id)
  where status <> 'RESOLVED';
create index if not exists observability_incident_project_idx
  on governance.observability_incidents(project_id,status,severity,last_observed_at desc);

create table if not exists governance.observability_incident_alerts (
  incident_id uuid not null references governance.observability_incidents(id) on delete cascade,
  alert_id uuid not null references profiling.observability_alerts(id) on delete cascade,
  linked_at timestamptz not null default now(),
  primary key (incident_id,alert_id)
);
create index if not exists observability_incident_alert_alert_idx
  on governance.observability_incident_alerts(alert_id);

create table if not exists governance.observability_incident_impacts (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references governance.observability_incidents(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  asset_type text not null,
  asset_id uuid,
  asset_name text,
  impact_type text not null default 'DOWNSTREAM_DEPENDENCY',
  distance integer not null default 0 check (distance >= 0),
  risk_score numeric not null default 0 check (risk_score >= 0 and risk_score <= 1),
  confidence numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(incident_id,asset_type,asset_id,asset_name)
);
create index if not exists observability_incident_impacts_incident_idx
  on governance.observability_incident_impacts(incident_id,risk_score desc);

alter table governance.observability_incidents enable row level security;
alter table governance.observability_incident_alerts enable row level security;
alter table governance.observability_incident_impacts enable row level security;

drop policy if exists observability_incidents_read on governance.observability_incidents;
create policy observability_incidents_read on governance.observability_incidents
for select to authenticated using (app_private.is_project_member(project_id));

drop policy if exists observability_incident_alerts_read on governance.observability_incident_alerts;
create policy observability_incident_alerts_read on governance.observability_incident_alerts
for select to authenticated using (
  exists (
    select 1 from governance.observability_incidents i
    where i.id=observability_incident_alerts.incident_id
      and app_private.is_project_member(i.project_id)
  )
);

drop policy if exists observability_incident_impacts_read on governance.observability_incident_impacts;
create policy observability_incident_impacts_read on governance.observability_incident_impacts
for select to authenticated using (app_private.is_project_member(project_id));

grant select on governance.observability_incidents,
  governance.observability_incident_alerts,
  governance.observability_incident_impacts to authenticated;
grant all on governance.observability_incidents,
  governance.observability_incident_alerts,
  governance.observability_incident_impacts to service_role;

drop trigger if exists trg_audit_observability_incidents on governance.observability_incidents;
create trigger trg_audit_observability_incidents
  after insert or update or delete on governance.observability_incidents
  for each row execute function governance.audit_project_table_change();

select pg_notify('pgrst','reload schema');
