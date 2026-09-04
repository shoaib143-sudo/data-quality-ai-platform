-- These SECURITY DEFINER functions are internal trigger handlers. They must not
-- be directly executable through PostgREST by anon or authenticated callers.
revoke execute on function agent.project_dq_recommendation_case() from public, anon, authenticated;
revoke execute on function agent.project_profiling_recommendation_case() from public, anon, authenticated;
revoke execute on function agent.project_remediation_knowledge_case() from public, anon, authenticated;
revoke execute on function profiling.on_profile_completed_quality_intelligence() from public, anon, authenticated;
