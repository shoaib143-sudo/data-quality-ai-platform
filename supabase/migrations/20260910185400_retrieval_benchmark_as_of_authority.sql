-- Reproducible governed retrieval benchmark snapshots. A benchmark run may only
-- consume case versions that existed at its declared as-of time.

create or replace function governance.list_ai_retrieval_evaluation_cases_as_of(
  p_project_id uuid,
  p_as_of timestamptz
)
returns table (
  id uuid,
  project_id uuid,
  case_key text,
  query_text text,
  authority text,
  evidence_refs text[],
  reviewer_user_id uuid,
  reviewer_capability text,
  reviewed_at timestamptz,
  source_reference text,
  created_at timestamptz
)
language sql
stable
security invoker
set search_path = pg_catalog, governance
as $$
  select distinct on (v.case_key)
    v.id,
    v.project_id,
    v.case_key,
    v.query_text,
    v.authority,
    v.evidence_refs,
    v.reviewer_user_id,
    v.reviewer_capability,
    v.reviewed_at,
    v.source_reference,
    v.created_at
  from governance.ai_retrieval_evaluation_case_versions v
  where v.project_id = p_project_id
    and v.created_at <= p_as_of
  order by v.case_key, v.created_at desc, v.id desc;
$$;

revoke all on function governance.list_ai_retrieval_evaluation_cases_as_of(uuid, timestamptz) from public, anon;
grant execute on function governance.list_ai_retrieval_evaluation_cases_as_of(uuid, timestamptz) to authenticated, service_role;
