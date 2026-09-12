-- Restore the intended read path for governed retrieval evaluation evidence.
--
-- The base tables already enforce project membership through RLS and the
-- effective-case view is SECURITY INVOKER. The original ADR-006 migration
-- omitted table/view SELECT grants, so authenticated project members passed
-- application authorization but PostgREST failed with permission denied.
--
-- This migration grants read access only. It does not grant INSERT, UPDATE,
-- DELETE, TRUNCATE, REFERENCES, or TRIGGER privileges to authenticated users.

revoke all on governance.ai_retrieval_evaluation_case_versions from anon;
revoke all on governance.ai_retrieval_relevance_judgments from anon;
revoke all on governance.ai_retrieval_evaluation_case_effective from anon;

grant select on governance.ai_retrieval_evaluation_case_versions to authenticated;
grant select on governance.ai_retrieval_relevance_judgments to authenticated;
grant select on governance.ai_retrieval_evaluation_case_effective to authenticated;

grant select on governance.ai_retrieval_evaluation_case_versions to service_role;
grant select on governance.ai_retrieval_relevance_judgments to service_role;
grant select on governance.ai_retrieval_evaluation_case_effective to service_role;

-- Fail the migration if the read-only boundary is not exactly preserved.
do $$
begin
  if not has_table_privilege('authenticated', 'governance.ai_retrieval_evaluation_case_versions', 'SELECT')
     or not has_table_privilege('authenticated', 'governance.ai_retrieval_relevance_judgments', 'SELECT')
     or not has_table_privilege('authenticated', 'governance.ai_retrieval_evaluation_case_effective', 'SELECT') then
    raise exception 'RETRIEVAL_EVALUATION_AUTHENTICATED_READ_GRANT_MISSING';
  end if;

  if has_table_privilege('anon', 'governance.ai_retrieval_evaluation_case_versions', 'SELECT')
     or has_table_privilege('anon', 'governance.ai_retrieval_relevance_judgments', 'SELECT')
     or has_table_privilege('anon', 'governance.ai_retrieval_evaluation_case_effective', 'SELECT') then
    raise exception 'RETRIEVAL_EVALUATION_ANONYMOUS_READ_MUST_BE_DENIED';
  end if;

  if has_table_privilege('authenticated', 'governance.ai_retrieval_evaluation_case_versions', 'INSERT')
     or has_table_privilege('authenticated', 'governance.ai_retrieval_evaluation_case_versions', 'UPDATE')
     or has_table_privilege('authenticated', 'governance.ai_retrieval_evaluation_case_versions', 'DELETE')
     or has_table_privilege('authenticated', 'governance.ai_retrieval_evaluation_case_versions', 'TRUNCATE')
     or has_table_privilege('authenticated', 'governance.ai_retrieval_evaluation_case_versions', 'REFERENCES')
     or has_table_privilege('authenticated', 'governance.ai_retrieval_evaluation_case_versions', 'TRIGGER')
     or has_table_privilege('authenticated', 'governance.ai_retrieval_relevance_judgments', 'INSERT')
     or has_table_privilege('authenticated', 'governance.ai_retrieval_relevance_judgments', 'UPDATE')
     or has_table_privilege('authenticated', 'governance.ai_retrieval_relevance_judgments', 'DELETE')
     or has_table_privilege('authenticated', 'governance.ai_retrieval_relevance_judgments', 'TRUNCATE')
     or has_table_privilege('authenticated', 'governance.ai_retrieval_relevance_judgments', 'REFERENCES')
     or has_table_privilege('authenticated', 'governance.ai_retrieval_relevance_judgments', 'TRIGGER') then
    raise exception 'RETRIEVAL_EVALUATION_AUTHENTICATED_MUTATION_GRANT_FORBIDDEN';
  end if;
end
$$;

comment on view governance.ai_retrieval_evaluation_case_effective is
  'Latest governed retrieval evaluation case per project/key. SECURITY INVOKER plus base-table RLS preserves project membership; authenticated access is read-only evidence access and confers no model or governance authority.';
