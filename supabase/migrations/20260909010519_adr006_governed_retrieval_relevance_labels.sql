create table governance.ai_retrieval_evaluation_case_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  case_key text not null check (length(btrim(case_key)) > 0),
  query_text text not null check (length(btrim(query_text)) > 0),
  authority text not null check (authority in ('HUMAN_REVIEWED','GOVERNED_IMPORT')),
  evidence_refs text[] not null check (cardinality(evidence_refs) > 0),
  reviewer_user_id uuid references auth.users(id) on delete restrict,
  reviewer_capability text,
  reviewed_at timestamptz,
  source_reference text,
  created_at timestamptz not null default now(),
  constraint ai_retrieval_case_authority_evidence check (
    (
      authority = 'HUMAN_REVIEWED' and
      reviewer_user_id is not null and
      reviewer_capability is not null and length(btrim(reviewer_capability)) > 0 and
      reviewed_at is not null
    ) or (
      authority = 'GOVERNED_IMPORT' and
      source_reference is not null and length(btrim(source_reference)) > 0
    )
  )
);

create index ai_retrieval_evaluation_case_versions_project_key_created_idx
  on governance.ai_retrieval_evaluation_case_versions(project_id, case_key, created_at desc, id desc);

create table governance.ai_retrieval_relevance_judgments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references app.projects(id) on delete restrict,
  case_version_id uuid not null references governance.ai_retrieval_evaluation_case_versions(id) on delete restrict,
  object_key text not null check (length(btrim(object_key)) > 0),
  relevance integer not null check (relevance >= 0),
  created_at timestamptz not null default now(),
  unique (case_version_id, object_key)
);

create index ai_retrieval_relevance_judgments_project_case_idx
  on governance.ai_retrieval_relevance_judgments(project_id, case_version_id, object_key);

create or replace function governance.enforce_retrieval_judgment_project()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_project_id uuid;
begin
  select c.project_id into v_project_id
  from governance.ai_retrieval_evaluation_case_versions c
  where c.id = new.case_version_id;

  if v_project_id is null or v_project_id <> new.project_id then
    raise exception 'RETRIEVAL_JUDGMENT_PROJECT_MISMATCH';
  end if;
  return new;
end;
$$;

create trigger ai_retrieval_relevance_judgments_project_guard
before insert or update on governance.ai_retrieval_relevance_judgments
for each row execute function governance.enforce_retrieval_judgment_project();

alter table governance.ai_retrieval_evaluation_case_versions enable row level security;
create policy ai_retrieval_evaluation_case_versions_read
  on governance.ai_retrieval_evaluation_case_versions
  for select
  using (app_private.is_project_member(project_id));

alter table governance.ai_retrieval_relevance_judgments enable row level security;
create policy ai_retrieval_relevance_judgments_read
  on governance.ai_retrieval_relevance_judgments
  for select
  using (app_private.is_project_member(project_id));

create view governance.ai_retrieval_evaluation_case_effective
with (security_invoker = true)
as
select distinct on (project_id, case_key)
  id, project_id, case_key, query_text, authority, evidence_refs,
  reviewer_user_id, reviewer_capability, reviewed_at, source_reference, created_at
from governance.ai_retrieval_evaluation_case_versions
order by project_id, case_key, created_at desc, id desc;

comment on table governance.ai_retrieval_evaluation_case_versions is 'ADR-006 append-only governed retrieval relevance evaluation cases. Labels are explicit human-reviewed or governed-import evidence and must never be inferred from model output or remediation prose.';
comment on table governance.ai_retrieval_relevance_judgments is 'ADR-006 explicit relevance judgments attached to a governed retrieval evaluation case version. These judgments are evaluation evidence, not model or governance authority.';
comment on view governance.ai_retrieval_evaluation_case_effective is 'Latest recorded governed retrieval evaluation case version per project and stable case key. The view does not imply that labels are sufficient for evaluation; consumers must still require positive judgments.';
