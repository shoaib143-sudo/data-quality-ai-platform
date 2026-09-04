create table if not exists governance.profiling_remediation_outcomes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  workflow_instance_id uuid not null references governance.workflow_instances(id) on delete cascade,
  source_profile_run_id uuid not null references profiling.profile_runs(id) on delete cascade,
  verification_profile_run_id uuid references profiling.profile_runs(id) on delete set null,
  status text not null default 'APPROVED' check(status in ('APPROVED','ACTION_TRACKED','VERIFIED','VERIFICATION_FAILED')),
  execution_mode text,
  production_mutation_performed boolean not null default false,
  remediation_issue_ids uuid[] not null default '{}',
  source_quality_score numeric,
  verification_quality_score numeric,
  quality_score_delta numeric,
  source_high_severity_findings integer,
  verification_high_severity_findings integer,
  high_severity_findings_delta integer,
  checks jsonb not null default '{}'::jsonb,
  outcome jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  verified_at timestamptz,
  unique(workflow_instance_id)
);

create index if not exists profiling_remediation_outcomes_project_idx
  on governance.profiling_remediation_outcomes(project_id, updated_at desc);
create index if not exists profiling_remediation_outcomes_source_run_idx
  on governance.profiling_remediation_outcomes(source_profile_run_id);

alter table governance.profiling_remediation_outcomes enable row level security;

drop policy if exists profiling_remediation_outcomes_read on governance.profiling_remediation_outcomes;
create policy profiling_remediation_outcomes_read
  on governance.profiling_remediation_outcomes
  for select to authenticated
  using (app_private.is_project_member(project_id));

grant select on governance.profiling_remediation_outcomes to authenticated;
grant all on governance.profiling_remediation_outcomes to service_role;
