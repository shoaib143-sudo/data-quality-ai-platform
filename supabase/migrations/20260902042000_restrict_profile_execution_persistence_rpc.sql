revoke execute on function profiling.persist_profile_execution_result(uuid, jsonb, jsonb, jsonb, text) from public, anon, authenticated;
alter function profiling.persist_profile_execution_result(uuid, jsonb, jsonb, jsonb, text) set search_path = pg_catalog, profiling;
