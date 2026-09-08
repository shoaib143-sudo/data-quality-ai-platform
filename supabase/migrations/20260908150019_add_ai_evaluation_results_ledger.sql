create table governance.ai_evaluation_results (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  evaluation_type text not null check (length(btrim(evaluation_type)) > 0),
  capability text check (capability is null or length(btrim(capability)) > 0),
  metric_name text not null check (length(btrim(metric_name)) > 0),
  score numeric(9,6) check (score is null or (score >= 0 and score <= 1)),
  pass boolean,
  evaluator_type text not null check (length(btrim(evaluator_type)) > 0),
  evaluator_version text check (evaluator_version is null or length(btrim(evaluator_version)) > 0),
  ai_system_id uuid references governance.ai_systems(id) on delete restrict,
  ai_system_version_id uuid references governance.ai_system_versions(id) on delete restrict,
  agent_run_id uuid references agent.agent_runs(id) on delete restrict,
  source_agent_evaluation_id uuid references agent.agent_evaluations(id) on delete restrict,
  telemetry_event_id uuid references governance.ai_telemetry_events(id) on delete restrict,
  correlation_id uuid,
  evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_refs) = 'array'),
  dimensions jsonb not null default '{}'::jsonb check (jsonb_typeof(dimensions) = 'object'),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index ai_evaluation_results_project_observed_idx
  on governance.ai_evaluation_results(project_id, observed_at desc);
create index ai_evaluation_results_type_metric_idx
  on governance.ai_evaluation_results(project_id, evaluation_type, metric_name, observed_at desc);
create index ai_evaluation_results_ai_system_idx
  on governance.ai_evaluation_results(ai_system_id, observed_at desc)
  where ai_system_id is not null;
create index ai_evaluation_results_ai_system_version_idx
  on governance.ai_evaluation_results(ai_system_version_id, observed_at desc)
  where ai_system_version_id is not null;
create index ai_evaluation_results_agent_run_idx
  on governance.ai_evaluation_results(agent_run_id, observed_at desc)
  where agent_run_id is not null;
create index ai_evaluation_results_source_agent_eval_idx
  on governance.ai_evaluation_results(source_agent_evaluation_id)
  where source_agent_evaluation_id is not null;
create index ai_evaluation_results_telemetry_event_idx
  on governance.ai_evaluation_results(telemetry_event_id)
  where telemetry_event_id is not null;
create index ai_evaluation_results_correlation_idx
  on governance.ai_evaluation_results(correlation_id, observed_at desc)
  where correlation_id is not null;

alter table governance.ai_evaluation_results enable row level security;

create policy ai_evaluation_results_read
  on governance.ai_evaluation_results
  for select
  to authenticated
  using (app_private.is_project_member(project_id));

revoke all on governance.ai_evaluation_results from anon;
grant select on governance.ai_evaluation_results to authenticated;
grant select, insert on governance.ai_evaluation_results to service_role;

comment on table governance.ai_evaluation_results is
  'Append-only ADR-006 automated evaluation evidence. Results inform routing and analysis but do not automatically create or approve governed AI-system assessments.';
comment on column governance.ai_evaluation_results.evidence_refs is
  'Identifiers/references to verified evidence only; not prompts, completions, or hidden chain-of-thought.';
comment on column governance.ai_evaluation_results.metadata is
  'Operational evaluation metadata only. Application EvaluationEngine rejects sensitive prompt/completion/hidden-reasoning payload keys before persistence.';
