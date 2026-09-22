begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Live production profiling validation executes this read-only contract RPC
-- through the server-side service-role client. Keep browser-facing roles
-- explicitly denied while restoring only the missing server-side EXECUTE.
revoke execute on function profiling.validate_metric_execution_contract(uuid)
  from public, anon, authenticated;

grant execute on function profiling.validate_metric_execution_contract(uuid)
  to service_role;

do $$
begin
  if not has_schema_privilege('service_role', 'profiling', 'USAGE') then
    raise exception 'PROFILING_VALIDATION_RPC_ACL_INVALID: service_role lacks profiling schema usage';
  end if;

  if not has_function_privilege(
    'service_role',
    'profiling.validate_metric_execution_contract(uuid)',
    'EXECUTE'
  ) then
    raise exception 'PROFILING_VALIDATION_RPC_ACL_INVALID: service_role execute grant is missing';
  end if;

  if has_function_privilege(
    'anon',
    'profiling.validate_metric_execution_contract(uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'authenticated',
    'profiling.validate_metric_execution_contract(uuid)',
    'EXECUTE'
  ) then
    raise exception 'PROFILING_VALIDATION_RPC_ACL_INVALID: browser-facing execute authority was broadened';
  end if;
end
$$;

commit;
