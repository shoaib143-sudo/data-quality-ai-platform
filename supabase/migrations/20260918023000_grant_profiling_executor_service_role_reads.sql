begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The deterministic profiling executor is a server-only path. It uses the
-- service-role client for read-side orchestration, while result persistence
-- continues through profiling.persist_profiling_results(). This migration
-- grants only the missing read contract required by that executor.
grant usage on schema profiling to service_role;

grant select on table
  profiling.profile_runs,
  profiling.profile_columns,
  profiling.metric_definitions,
  profiling.dataset_execution_sources,
  profiling.sampling_policies
to service_role;

-- Fail closed if the intended read contract is incomplete or this migration
-- accidentally broadens anonymous profiling access. Existing service-role
-- privileges outside this migration remain unchanged.
do $$
begin
  if not has_schema_privilege('service_role', 'profiling', 'USAGE') then
    raise exception 'PROFILING_EXECUTOR_ACL_INVALID: service_role lacks profiling schema usage';
  end if;

  if not has_table_privilege('service_role', 'profiling.profile_runs', 'SELECT')
    or not has_table_privilege('service_role', 'profiling.profile_columns', 'SELECT')
    or not has_table_privilege('service_role', 'profiling.metric_definitions', 'SELECT')
    or not has_table_privilege('service_role', 'profiling.dataset_execution_sources', 'SELECT')
    or not has_table_privilege('service_role', 'profiling.sampling_policies', 'SELECT') then
    raise exception 'PROFILING_EXECUTOR_ACL_INVALID: service_role read contract is incomplete';
  end if;

  if has_table_privilege('anon', 'profiling.profile_runs', 'SELECT')
    or has_table_privilege('anon', 'profiling.profile_columns', 'SELECT')
    or has_table_privilege('anon', 'profiling.metric_definitions', 'SELECT')
    or has_table_privilege('anon', 'profiling.dataset_execution_sources', 'SELECT')
    or has_table_privilege('anon', 'profiling.sampling_policies', 'SELECT') then
    raise exception 'PROFILING_EXECUTOR_ACL_INVALID: anonymous profiling reads were broadened';
  end if;
end
$$;

commit;
