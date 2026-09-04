-- Data Quality Autonomous Operations
-- Adds durable investigation, governed remediation outcomes and recommendation learning.

create table if not exists governance.data_quality_investigations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  agent_run_id uuid not null unique references agent.agent_runs(id) on delete cascade,
  dataset_id uuid not null references catalog.datasets(id) on delete cascade,
  dataset_version_id uuid not null references catalog.dataset_versions(id) on delete cascade,
  profile_run_id uuid references profiling.profile_runs(id) on delete set null,
  severity text not null default 'INFO' check (severity in ('INFO','LOW','MEDIUM','HIGH','CRITICAL')),
  status text not null default 'CONTROLLED' check (status in ('CONTROLLED','ATTENTION_REQUIRED','APPROVAL_REQUIRED','REMEDIATION_TRACKED','VERIFIED','VERIFICATION_FAILED','ERROR')),
  summary text not null,
  probable_root_causes jsonb not null default '[]'::jsonb,
  business_impact text,
  risk jsonb not null default '{}'::jsonb,
  recommendations jsonb not null default '[]'::jsonb,
  approval_required boolean not null default false,
  workflow_instance_id uuid references governance.workflow_instances(id) on delete set null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists data_quality_investigations_project_idx
  on governance.data_quality_investigations(project_id, created_at desc);
create index if not exists data_quality_investigations_dataset_idx
  on governance.data_quality_investigations(dataset_id, created_at desc);
create index if not exists data_quality_investigations_workflow_idx
  on governance.data_quality_investigations(workflow_instance_id)
  where workflow_instance_id is not null;

create table if not exists governance.data_quality_remediation_outcomes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  workflow_instance_id uuid not null unique references governance.workflow_instances(id) on delete cascade,
  investigation_id uuid not null references governance.data_quality_investigations(id) on delete cascade,
  source_agent_run_id uuid not null references agent.agent_runs(id) on delete cascade,
  verification_agent_run_id uuid references agent.agent_runs(id) on delete set null,
  status text not null default 'ACTION_TRACKED' check (status in ('ACTION_TRACKED','WAITING_FOR_REMEDIATION','VERIFICATION_QUEUED','VERIFIED','VERIFICATION_FAILED','VERIFICATION_ERROR','CANCELLED')),
  execution_mode text not null default 'TRACKED_GOVERNANCE_ISSUES_ONLY',
  production_mutation_performed boolean not null default false,
  remediation_issue_ids uuid[] not null default '{}',
  checks jsonb not null default '{}'::jsonb,
  outcome jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz
);

create index if not exists data_quality_remediation_project_idx
  on governance.data_quality_remediation_outcomes(project_id, created_at desc);
create index if not exists data_quality_remediation_source_run_idx
  on governance.data_quality_remediation_outcomes(source_agent_run_id);
create index if not exists data_quality_remediation_verification_run_idx
  on governance.data_quality_remediation_outcomes(verification_agent_run_id)
  where verification_agent_run_id is not null;

create table if not exists governance.data_quality_recommendation_learning (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  workflow_instance_id uuid not null references governance.workflow_instances(id) on delete cascade,
  remediation_outcome_id uuid not null references governance.data_quality_remediation_outcomes(id) on delete cascade,
  source_agent_run_id uuid not null references agent.agent_runs(id) on delete cascade,
  verification_agent_run_id uuid references agent.agent_runs(id) on delete set null,
  recommendation_action text not null,
  priority text,
  rationale text,
  quality_rule_run_ids uuid[] not null default '{}',
  status text not null default 'PENDING' check (status in ('PENDING','VERIFIED','INEFFECTIVE','ERROR')),
  effective boolean,
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(workflow_instance_id, recommendation_action)
);

create index if not exists data_quality_learning_project_idx
  on governance.data_quality_recommendation_learning(project_id, updated_at desc);
create index if not exists data_quality_learning_action_idx
  on governance.data_quality_recommendation_learning(recommendation_action, status);

alter table governance.data_quality_investigations enable row level security;
alter table governance.data_quality_remediation_outcomes enable row level security;
alter table governance.data_quality_recommendation_learning enable row level security;

drop policy if exists data_quality_investigations_read on governance.data_quality_investigations;
create policy data_quality_investigations_read on governance.data_quality_investigations
for select to authenticated
using (app_private.is_project_member(project_id));

drop policy if exists data_quality_remediation_outcomes_read on governance.data_quality_remediation_outcomes;
create policy data_quality_remediation_outcomes_read on governance.data_quality_remediation_outcomes
for select to authenticated
using (app_private.is_project_member(project_id));

drop policy if exists data_quality_recommendation_learning_read on governance.data_quality_recommendation_learning;
create policy data_quality_recommendation_learning_read on governance.data_quality_recommendation_learning
for select to authenticated
using (app_private.is_project_member(project_id));

grant select on governance.data_quality_investigations,
  governance.data_quality_remediation_outcomes,
  governance.data_quality_recommendation_learning to authenticated;
grant all on governance.data_quality_investigations,
  governance.data_quality_remediation_outcomes,
  governance.data_quality_recommendation_learning to service_role;

-- Reuse the existing immutable governance audit trigger for state changes.
drop trigger if exists trg_audit_data_quality_investigations on governance.data_quality_investigations;
create trigger trg_audit_data_quality_investigations
  after insert or update or delete on governance.data_quality_investigations
  for each row execute function governance.audit_project_table_change();

drop trigger if exists trg_audit_data_quality_remediation_outcomes on governance.data_quality_remediation_outcomes;
create trigger trg_audit_data_quality_remediation_outcomes
  after insert or update or delete on governance.data_quality_remediation_outcomes
  for each row execute function governance.audit_project_table_change();

drop trigger if exists trg_audit_data_quality_recommendation_learning on governance.data_quality_recommendation_learning;
create trigger trg_audit_data_quality_recommendation_learning
  after insert or update or delete on governance.data_quality_recommendation_learning
  for each row execute function governance.audit_project_table_change();

select pg_notify('pgrst','reload schema');
