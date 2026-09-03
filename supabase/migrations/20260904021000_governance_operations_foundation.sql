-- Governance operations foundation
-- Durable orchestration, scheduling, row-level DQ exceptions, catalog, glossary,
-- stewardship, remediation, classification, observability policy and notifications.

create schema if not exists orchestration;

create table if not exists orchestration.job_queue (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  job_type text not null check (job_type in ('PROFILING','DATA_QUALITY','NOTIFICATION','OBSERVABILITY')),
  entity_id uuid,
  agent_run_id uuid references agent.agent_runs(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'QUEUED' check (status in ('QUEUED','RUNNING','SUCCEEDED','FAILED','DEAD','CANCELLED')),
  priority integer not null default 100,
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts >= 1),
  available_at timestamptz not null default now(),
  lease_owner text,
  lease_expires_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists job_queue_claim_idx on orchestration.job_queue(status,available_at,priority,created_at);
create unique index if not exists job_queue_agent_run_unique on orchestration.job_queue(agent_run_id) where agent_run_id is not null;

create table if not exists orchestration.job_schedules (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_version_id uuid not null references catalog.dataset_versions(id) on delete cascade,
  job_type text not null check (job_type in ('PROFILING','DATA_QUALITY')),
  name text not null,
  enabled boolean not null default true,
  timezone text not null default 'UTC',
  cadence text not null check (cadence in ('HOURLY','DAILY','WEEKLY','INTERVAL')),
  interval_minutes integer,
  run_hour integer check (run_hour between 0 and 23),
  run_minute integer check (run_minute between 0 and 59),
  day_of_week integer check (day_of_week between 0 and 6),
  next_run_at timestamptz not null,
  last_enqueued_at timestamptz,
  last_completed_at timestamptz,
  misfire_policy text not null default 'RUN_ONCE' check (misfire_policy in ('RUN_ONCE','SKIP','CATCH_UP')),
  retry_policy jsonb not null default '{"max_attempts":3,"backoff_minutes":5}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists job_schedules_due_idx on orchestration.job_schedules(enabled,next_run_at);

alter table profiling.quality_rule_definitions
  add column if not exists rule_type text not null default 'METRIC_THRESHOLD',
  add column if not exists rule_config jsonb not null default '{}'::jsonb,
  add column if not exists certification_required boolean not null default false;

create table if not exists profiling.quality_rule_exceptions (
  id uuid primary key default gen_random_uuid(),
  quality_rule_run_id uuid not null references profiling.quality_rule_runs(id) on delete cascade,
  rule_definition_id uuid not null references profiling.quality_rule_definitions(id) on delete cascade,
  dataset_version_id uuid not null references catalog.dataset_versions(id) on delete cascade,
  profile_run_id uuid references profiling.profile_runs(id) on delete set null,
  record_key text,
  record_hash text not null,
  column_name text,
  observed_value text,
  reason text not null,
  sample jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists quality_rule_exceptions_run_idx on profiling.quality_rule_exceptions(quality_rule_run_id);

create table if not exists profiling.quality_quarantine_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  dataset_version_id uuid not null references catalog.dataset_versions(id) on delete cascade,
  rule_definition_id uuid references profiling.quality_rule_definitions(id) on delete set null,
  quality_rule_run_id uuid references profiling.quality_rule_runs(id) on delete set null,
  record_hash text not null,
  record_key text,
  reason text not null,
  sample jsonb not null default '{}'::jsonb,
  status text not null default 'QUARANTINED' check (status in ('QUARANTINED','RELEASED','REJECTED')),
  created_at timestamptz not null default now(),
  released_at timestamptz
);
create index if not exists quality_quarantine_dataset_idx on profiling.quality_quarantine_records(dataset_id,status,created_at desc);

create table if not exists governance.dataset_catalog (
  dataset_id uuid primary key references catalog.datasets(id) on delete cascade,
  project_id uuid not null references app.projects(id) on delete cascade,
  technical_owner_user_id uuid references auth.users(id) on delete set null,
  business_owner_user_id uuid references auth.users(id) on delete set null,
  steward_user_id uuid references auth.users(id) on delete set null,
  lifecycle_status text not null default 'ACTIVE' check (lifecycle_status in ('DRAFT','ACTIVE','DEPRECATED','RETIRED')),
  certification_status text not null default 'UNCERTIFIED' check (certification_status in ('UNCERTIFIED','PENDING','CERTIFIED','REJECTED','EXPIRED')),
  criticality text not null default 'MEDIUM' check (criticality in ('LOW','MEDIUM','HIGH','CRITICAL')),
  tags text[] not null default '{}',
  business_description text,
  retention_days integer,
  metadata jsonb not null default '{}'::jsonb,
  certified_at timestamptz,
  certified_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists governance.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  term text not null,
  definition text not null,
  domain text,
  synonyms text[] not null default '{}',
  status text not null default 'DRAFT' check (status in ('DRAFT','APPROVED','DEPRECATED')),
  owner_user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id,term)
);

create table if not exists governance.glossary_mappings (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references governance.glossary_terms(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  column_name text,
  confidence numeric check (confidence between 0 and 1),
  approved boolean not null default false,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(term_id,dataset_id,column_name)
);

create table if not exists governance.stewardship_assignments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('BUSINESS_OWNER','TECHNICAL_OWNER','DATA_STEWARD','CUSTODIAN')),
  accountability text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique(dataset_id,user_id,role)
);

create table if not exists governance.certification_requests (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  requested_by uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING','IN_REVIEW','APPROVED','REJECTED','CANCELLED')),
  decision_notes text,
  evidence jsonb not null default '{}'::jsonb,
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

create table if not exists governance.issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid references catalog.datasets(id) on delete cascade,
  dataset_version_id uuid references catalog.dataset_versions(id) on delete set null,
  profile_run_id uuid references profiling.profile_runs(id) on delete set null,
  finding_id uuid references profiling.profile_findings(id) on delete set null,
  quality_rule_run_id uuid references profiling.quality_rule_runs(id) on delete set null,
  title text not null,
  description text,
  severity text not null default 'MEDIUM' check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'OPEN' check (status in ('OPEN','TRIAGED','IN_PROGRESS','BLOCKED','RESOLVED','CLOSED')),
  owner_user_id uuid references auth.users(id) on delete set null,
  due_at timestamptz,
  resolution_summary text,
  resolution_evidence jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists governance.issue_comments (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references governance.issues(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  comment text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists governance.classification_labels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references app.projects(id) on delete cascade,
  code text not null,
  name text not null,
  category text not null check (category in ('PII','PHI','PCI','FINANCIAL','CONFIDENTIAL','PUBLIC','INTERNAL')),
  description text,
  handling_requirements jsonb not null default '{}'::jsonb,
  enabled boolean not null default true,
  unique(project_id,code)
);

create table if not exists governance.dataset_classifications (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  column_name text,
  label_id uuid not null references governance.classification_labels(id) on delete cascade,
  status text not null default 'SUGGESTED' check (status in ('SUGGESTED','APPROVED','REJECTED')),
  confidence numeric check (confidence between 0 and 1),
  source text not null default 'PROFILING',
  approved_by uuid references auth.users(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(dataset_id,column_name,label_id)
);

create table if not exists governance.classification_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  label_id uuid not null references governance.classification_labels(id) on delete cascade,
  name text not null,
  description text,
  required_controls jsonb not null default '{}'::jsonb,
  retention_days integer,
  encryption_required boolean not null default false,
  masking_required boolean not null default false,
  approval_required boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique(project_id,label_id,name)
);

create table if not exists profiling.observability_policies (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  dataset_id uuid not null unique references catalog.datasets(id) on delete cascade,
  freshness_sla_hours integer not null default 24 check (freshness_sla_hours > 0),
  max_volume_change_ratio numeric not null default 0.5 check (max_volume_change_ratio >= 0),
  max_score_drop numeric not null default 0.1 check (max_score_drop >= 0 and max_score_drop <= 1),
  schema_change_policy text not null default 'ALERT' check (schema_change_policy in ('IGNORE','ALERT','BLOCK')),
  enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists profiling.notification_channels (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  name text not null,
  channel_type text not null check (channel_type in ('EMAIL','SLACK','WEBHOOK')),
  target text not null,
  secret_ref text,
  enabled boolean not null default true,
  suppression_minutes integer not null default 60 check (suppression_minutes >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(project_id,name)
);

create table if not exists profiling.notification_routes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  channel_id uuid not null references profiling.notification_channels(id) on delete cascade,
  alert_category text,
  min_severity text not null default 'MEDIUM',
  dataset_id uuid references catalog.datasets(id) on delete cascade,
  enabled boolean not null default true,
  escalation_after_minutes integer,
  created_at timestamptz not null default now()
);

create table if not exists profiling.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references profiling.observability_alerts(id) on delete cascade,
  route_id uuid references profiling.notification_routes(id) on delete set null,
  channel_id uuid references profiling.notification_channels(id) on delete set null,
  status text not null default 'PENDING' check (status in ('PENDING','SENT','SUPPRESSED','FAILED')),
  attempt integer not null default 0,
  response_code integer,
  error_message text,
  delivered_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists lineage_edge_identity
on governance.lineage_edges(project_id,source_type,source_id,target_type,target_id,relationship);

-- RLS policies and grants are project-scoped.
alter table orchestration.job_queue enable row level security;
alter table orchestration.job_schedules enable row level security;
alter table profiling.quality_rule_exceptions enable row level security;
alter table profiling.quality_quarantine_records enable row level security;
alter table governance.dataset_catalog enable row level security;
alter table governance.glossary_terms enable row level security;
alter table governance.glossary_mappings enable row level security;
alter table governance.stewardship_assignments enable row level security;
alter table governance.certification_requests enable row level security;
alter table governance.issues enable row level security;
alter table governance.issue_comments enable row level security;
alter table governance.classification_labels enable row level security;
alter table governance.dataset_classifications enable row level security;
alter table governance.classification_policies enable row level security;
alter table profiling.observability_policies enable row level security;
alter table profiling.notification_channels enable row level security;
alter table profiling.notification_routes enable row level security;
alter table profiling.notification_deliveries enable row level security;

do $$
declare t text;
begin
  foreach t in array array['job_queue','job_schedules'] loop
    execute format('drop policy if exists %I_project_access on orchestration.%I',t,t);
    execute format('create policy %I_project_access on orchestration.%I for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id))',t,t);
  end loop;
end $$;

drop policy if exists quality_rule_exceptions_select on profiling.quality_rule_exceptions;
create policy quality_rule_exceptions_select on profiling.quality_rule_exceptions for select to authenticated using (
  exists(select 1 from profiling.quality_rule_definitions r where r.id=rule_definition_id and app_private.is_project_member(r.project_id))
);
drop policy if exists quality_quarantine_project_access on profiling.quality_quarantine_records;
create policy quality_quarantine_project_access on profiling.quality_quarantine_records for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));
drop policy if exists dataset_catalog_project_access on governance.dataset_catalog;
create policy dataset_catalog_project_access on governance.dataset_catalog for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));
drop policy if exists glossary_terms_project_access on governance.glossary_terms;
create policy glossary_terms_project_access on governance.glossary_terms for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));
drop policy if exists glossary_mappings_project_access on governance.glossary_mappings;
create policy glossary_mappings_project_access on governance.glossary_mappings for all to authenticated using (exists(select 1 from governance.glossary_terms t where t.id=term_id and app_private.is_project_member(t.project_id))) with check (exists(select 1 from governance.glossary_terms t where t.id=term_id and app_private.is_project_member(t.project_id)));
drop policy if exists stewardship_project_access on governance.stewardship_assignments;
create policy stewardship_project_access on governance.stewardship_assignments for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));
drop policy if exists certifications_project_access on governance.certification_requests;
create policy certifications_project_access on governance.certification_requests for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));
drop policy if exists issues_project_access on governance.issues;
create policy issues_project_access on governance.issues for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));
drop policy if exists issue_comments_project_access on governance.issue_comments;
create policy issue_comments_project_access on governance.issue_comments for all to authenticated using (exists(select 1 from governance.issues i where i.id=issue_id and app_private.is_project_member(i.project_id))) with check (exists(select 1 from governance.issues i where i.id=issue_id and app_private.is_project_member(i.project_id)));
drop policy if exists classification_labels_project_access on governance.classification_labels;
create policy classification_labels_project_access on governance.classification_labels for all to authenticated using (project_id is null or app_private.is_project_member(project_id)) with check (project_id is null or app_private.is_project_member(project_id));
drop policy if exists dataset_classifications_project_access on governance.dataset_classifications;
create policy dataset_classifications_project_access on governance.dataset_classifications for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));
drop policy if exists classification_policies_project_access on governance.classification_policies;
create policy classification_policies_project_access on governance.classification_policies for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));
drop policy if exists observability_policies_project_access on profiling.observability_policies;
create policy observability_policies_project_access on profiling.observability_policies for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));
drop policy if exists notification_channels_project_access on profiling.notification_channels;
create policy notification_channels_project_access on profiling.notification_channels for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));
drop policy if exists notification_routes_project_access on profiling.notification_routes;
create policy notification_routes_project_access on profiling.notification_routes for all to authenticated using (app_private.is_project_member(project_id)) with check (app_private.is_project_member(project_id));
drop policy if exists notification_deliveries_project_access on profiling.notification_deliveries;
create policy notification_deliveries_project_access on profiling.notification_deliveries for select to authenticated using (exists(select 1 from profiling.observability_alerts a where a.id=alert_id and app_private.is_project_member(a.project_id)));

grant usage on schema orchestration to authenticated,service_role;
grant select,insert,update,delete on orchestration.job_schedules to authenticated;
grant select on orchestration.job_queue to authenticated;
grant all on all tables in schema orchestration to service_role;
grant select on profiling.quality_rule_exceptions to authenticated;
grant select,insert,update on profiling.quality_quarantine_records to authenticated;
grant all on profiling.quality_rule_exceptions,profiling.quality_quarantine_records to service_role;
grant select,insert,update,delete on governance.dataset_catalog,governance.glossary_terms,governance.glossary_mappings,governance.stewardship_assignments,governance.certification_requests,governance.issues,governance.issue_comments,governance.classification_labels,governance.dataset_classifications,governance.classification_policies to authenticated;
grant select,insert,update,delete on profiling.observability_policies,profiling.notification_channels,profiling.notification_routes to authenticated;
grant select on profiling.notification_deliveries to authenticated;
grant all on governance.dataset_catalog,governance.glossary_terms,governance.glossary_mappings,governance.stewardship_assignments,governance.certification_requests,governance.issues,governance.issue_comments,governance.classification_labels,governance.dataset_classifications,governance.classification_policies to service_role;
grant all on profiling.observability_policies,profiling.notification_channels,profiling.notification_routes,profiling.notification_deliveries to service_role;

insert into governance.classification_labels(project_id,code,name,category,description,handling_requirements)
select null,'PII','Personally Identifiable Information','PII','Data that can identify or contact an individual.','{"access":"restricted","masking":"recommended","encryption":"required"}'::jsonb
where not exists(select 1 from governance.classification_labels where project_id is null and code='PII');
insert into governance.classification_labels(project_id,code,name,category,description,handling_requirements)
select null,'PHI','Protected Health Information','PHI','Health information linked to an identifiable individual.','{"access":"need_to_know","encryption":"required","audit":"required"}'::jsonb
where not exists(select 1 from governance.classification_labels where project_id is null and code='PHI');
insert into governance.classification_labels(project_id,code,name,category,description,handling_requirements)
select null,'PCI','Payment Card Information','PCI','Payment card account or authentication data.','{"access":"restricted","masking":"required","encryption":"required"}'::jsonb
where not exists(select 1 from governance.classification_labels where project_id is null and code='PCI');

select pg_notify('pgrst','reload schema');
