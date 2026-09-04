create table if not exists governance.profiling_recommendation_learning (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete cascade,
  workflow_instance_id uuid not null references governance.workflow_instances(id) on delete cascade,
  remediation_outcome_id uuid references governance.profiling_remediation_outcomes(id) on delete cascade,
  source_profile_run_id uuid not null references profiling.profile_runs(id) on delete cascade,
  recommendation_action text not null,
  priority text,
  rationale text,
  finding_ids uuid[] not null default '{}',
  status text not null default 'PENDING' check(status in ('PENDING','EFFECTIVE','INEFFECTIVE')),
  effective boolean,
  quality_score_delta numeric,
  high_severity_findings_delta integer,
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  observed_at timestamptz,
  unique(workflow_instance_id, recommendation_action)
);

create index if not exists profiling_recommendation_learning_project_action_idx
  on governance.profiling_recommendation_learning(project_id, recommendation_action, observed_at desc nulls last);
create index if not exists profiling_recommendation_learning_source_run_idx
  on governance.profiling_recommendation_learning(source_profile_run_id);
create index if not exists profiling_recommendation_learning_outcome_idx
  on governance.profiling_recommendation_learning(remediation_outcome_id)
  where remediation_outcome_id is not null;
create index if not exists profiling_recommendation_learning_created_by_idx
  on governance.profiling_recommendation_learning(created_by)
  where created_by is not null;

alter table governance.profiling_recommendation_learning enable row level security;

drop policy if exists profiling_recommendation_learning_read on governance.profiling_recommendation_learning;
create policy profiling_recommendation_learning_read
  on governance.profiling_recommendation_learning
  for select to authenticated
  using (app_private.is_project_member(project_id));

grant select on governance.profiling_recommendation_learning to authenticated;
grant all on governance.profiling_recommendation_learning to service_role;
