begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- JDBC source configuration is a server-only governance path. Grant only the
-- columns required to select the governed execution source without broadening
-- anonymous access or granting unrestricted table updates.
grant update (source_type, source_uri, execution_config) on table
  profiling.dataset_execution_sources
to service_role;

do $$
begin
  if not has_column_privilege('service_role', 'profiling.dataset_execution_sources', 'source_type', 'UPDATE')
    or not has_column_privilege('service_role', 'profiling.dataset_execution_sources', 'source_uri', 'UPDATE')
    or not has_column_privilege('service_role', 'profiling.dataset_execution_sources', 'execution_config', 'UPDATE') then
    raise exception 'PROFILING_EXECUTOR_JDBC_ACL_INVALID: service_role JDBC source update contract is incomplete';
  end if;

  if has_column_privilege('anon', 'profiling.dataset_execution_sources', 'source_type', 'UPDATE')
    or has_column_privilege('anon', 'profiling.dataset_execution_sources', 'source_uri', 'UPDATE')
    or has_column_privilege('anon', 'profiling.dataset_execution_sources', 'execution_config', 'UPDATE') then
    raise exception 'PROFILING_EXECUTOR_JDBC_ACL_INVALID: anonymous JDBC source updates were broadened';
  end if;
end
$$;

commit;
