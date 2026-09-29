-- Governed learning case registry foundation.
-- Extends the existing candidate lifecycle with negative cases while preserving
-- the same fail-closed authority boundaries used by positive-case learning.

alter table agent.learning_candidates
  drop constraint if exists learning_candidates_candidate_type_check;

alter table agent.learning_candidates
  add constraint learning_candidates_candidate_type_check
  check (candidate_type in ('SKILL_IMPROVEMENT','POSITIVE_CASE','NEGATIVE_CASE'));

alter table agent.learning_candidates
  drop constraint if exists learning_candidates_category_check;

alter table agent.learning_candidates
  add constraint learning_candidates_category_check
  check (category in (
    'OUTPUT_CONTRACT','EVIDENCE_GROUNDING','TOOL_CONTRACT','AUTHORITY_GUARDRAIL',
    'CONFIDENCE_CALIBRATION','HANDOFF_CONTRACT','QUALITY_EVALUATION','RESOURCE_EFFICIENCY',
    'POSITIVE_CASE_EXPERIENCE','NEGATIVE_CASE_EXPERIENCE'
  ));

create table if not exists agent.negative_learning_cases (
  candidate_id uuid primary key,
  project_id uuid not null references app.projects(id) on delete cascade,
  source_agent_run_id uuid not null references agent.agent_runs(id) on delete restrict,
  run_mode text not null check (run_mode in ('SUPERVISED','HANDSFREE')),
  use_case_key text not null,
  problem_signature text not null,
  failure_summary text not null,
  avoid_lesson text not null,
  evidence_refs text[] not null,
  verification_evidence_refs text[] not null default '{}'::text[],
  review_status text not null default 'PENDING_REVIEW'
    check (review_status in ('PENDING_REVIEW','APPROVED','REJECTED','DEFERRED','ONE_OFF','RETIRED')),
  reviewed_by uuid references auth.users(id) on delete restrict,
  reviewed_at timestamptz,
  review_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint negative_learning_cases_candidate_project_uq unique (candidate_id, project_id),
  constraint negative_learning_cases_candidate_fk
    foreign key (candidate_id, project_id)
    references agent.learning_candidates(id, project_id)
    on delete cascade,
  constraint negative_learning_cases_use_case_ck check (length(btrim(use_case_key)) > 0),
  constraint negative_learning_cases_problem_ck check (length(btrim(problem_signature)) > 0),
  constraint negative_learning_cases_summary_ck check (length(btrim(failure_summary)) > 0),
  constraint negative_learning_cases_lesson_ck check (length(btrim(avoid_lesson)) > 0),
  constraint negative_learning_cases_evidence_ck check (cardinality(evidence_refs) > 0),
  constraint negative_learning_cases_review_consistency_ck check (
    (review_status = 'PENDING_REVIEW' and reviewed_by is null and reviewed_at is null)
    or
    (review_status <> 'PENDING_REVIEW' and reviewed_by is not null and reviewed_at is not null
      and length(btrim(coalesce(review_reason,''))) > 0)
  )
);

create index if not exists negative_learning_cases_project_status_idx
  on agent.negative_learning_cases(project_id, review_status, created_at desc);
create index if not exists negative_learning_cases_use_case_idx
  on agent.negative_learning_cases(project_id, use_case_key, review_status);
create index if not exists negative_learning_cases_source_run_idx
  on agent.negative_learning_cases(source_agent_run_id);

alter table agent.negative_learning_cases enable row level security;

drop policy if exists negative_learning_cases_project_read on agent.negative_learning_cases;
create policy negative_learning_cases_project_read
  on agent.negative_learning_cases for select to authenticated
  using (app_private.is_project_member(project_id));

revoke all on agent.negative_learning_cases from public, anon, authenticated, service_role;
grant select on agent.negative_learning_cases to authenticated, service_role;
grant select, insert, update on agent.negative_learning_cases to service_role;

comment on table agent.negative_learning_cases is
  'Human-reviewed negative learning evidence. Rows never grant action authority or mutate agent permissions.';
