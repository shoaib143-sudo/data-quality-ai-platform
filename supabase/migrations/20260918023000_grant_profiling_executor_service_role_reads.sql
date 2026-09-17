begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The deterministic profiling executor is a server-only path. It uses the
-- service-role client for read-side orchestration, while all result mutations
-- remain behind profiling.persist_profiling_results(). Keep that boundary
-- explicit rather than granting broad write access to profiling tables.
grant usage on schema profiling to service_role;

grant select on table
  profiling.profile_runs,
  profiling.profile_columns,
  profiling.metric_definitions,
  profiling.dataset_execution_sources,
  profiling.sampling_policies
to service_role;

-- Fail closed if this migration accidentally broadens browser-facing access.
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

  if has_table_privilege('service_role', 'profiling.profile_runs', 'INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role', 'profiling.profile_columns', 'INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role', 'profiling.metric_definitions', 'INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role', 'profiling.dataset_execution_sources', 'INSERT,UPDATE,DELETE')
    or has_table_privilege('service_role', 'profiling.sampling_policies', 'INSERT,UPDATE,DELETE') then
    raise exception 'PROFILING_EXECUTOR_ACL_INVALID: direct service_role writes are not part of the executor contract';
  end if;
end
$$;

commit;
