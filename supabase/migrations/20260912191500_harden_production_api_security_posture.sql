-- Close unintended API execution on internal SECURITY DEFINER trigger functions
-- while preserving the explicitly governed project-admin recovery RPC.

revoke all on function orchestration.capture_terminal_recovery_case() from public, anon, authenticated;
revoke all on function orchestration.enforce_recovery_retry_ceiling() from public, anon, authenticated;
revoke all on function orchestration.resolve_execution_recovery_after_success() from public, anon, authenticated;

grant execute on function orchestration.capture_terminal_recovery_case() to service_role;
grant execute on function orchestration.enforce_recovery_retry_ceiling() to service_role;
grant execute on function orchestration.resolve_execution_recovery_after_success() to service_role;

-- The admin recovery RPC is intentionally callable by authenticated users, but
-- its body enforces auth.uid() plus app_private.is_project_admin(project_id).
revoke all on function orchestration.request_execution_recovery_action_admin(uuid, text) from public, anon;
grant execute on function orchestration.request_execution_recovery_action_admin(uuid, text) to authenticated, service_role;

create or replace function governance.verify_database_api_security_posture()
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'governance'
as $$
declare
  v_schema_setting text;
  v_schemas text[];
  v_app_private_exposed boolean;
  v_governance_exposed boolean;
  v_orchestration_exposed boolean;
  v_anon_helper_exec integer;
  v_auth_helper_exec integer;
  v_unsafe_helper_search_path integer;
  v_unapproved_exposed_privileged_functions integer;
  v_governed_admin_rpc_auth_exec boolean;
  v_governed_admin_rpc_anon_exec boolean;
  v_governed_admin_rpc_guarded boolean;
  v_valid boolean;
begin
  select split_part(setting,'=',2) into v_schema_setting
  from (
    select unnest(s.setconfig) setting
    from pg_db_role_setting s
    join pg_roles r on r.oid=s.setrole
    where r.rolname='authenticator'
      and (s.setdatabase=0 or s.setdatabase=(select oid from pg_database where datname=current_database()))
  ) settings
  where setting like 'pgrst.db_schemas=%'
  limit 1;

  select array_agg(trim(value)) into v_schemas
  from unnest(string_to_array(coalesce(v_schema_setting,''),',')) value;

  v_app_private_exposed := coalesce('app_private'=any(v_schemas),false);
  v_governance_exposed := coalesce('governance'=any(v_schemas),false);
  v_orchestration_exposed := coalesce('orchestration'=any(v_schemas),false);

  select
    count(*) filter(where has_function_privilege('anon',p.oid,'EXECUTE')),
    count(*) filter(where has_function_privilege('authenticated',p.oid,'EXECUTE')),
    count(*) filter(where not coalesce(p.proconfig @> array['search_path=""'],false))
  into v_anon_helper_exec,v_auth_helper_exec,v_unsafe_helper_search_path
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='app_private'
    and p.proname in ('is_org_admin','is_org_member','is_project_admin','is_project_member')
    and p.prosecdef=true;

  select
    has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    has_function_privilege('anon', p.oid, 'EXECUTE'),
    coalesce(p.proconfig @> array['search_path=""'],false)
      and position('auth.uid()' in lower(p.prosrc)) > 0
      and position('app_private.is_project_admin' in lower(p.prosrc)) > 0
  into v_governed_admin_rpc_auth_exec, v_governed_admin_rpc_anon_exec, v_governed_admin_rpc_guarded
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='orchestration'
    and p.proname='request_execution_recovery_action_admin'
    and pg_get_function_identity_arguments(p.oid)='p_case_id uuid, p_action text'
    and p.prosecdef=true;

  select count(*) into v_unapproved_exposed_privileged_functions
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('governance','orchestration')
    and p.prosecdef=true
    and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'))
    and not (
      n.nspname='orchestration'
      and p.proname='request_execution_recovery_action_admin'
      and pg_get_function_identity_arguments(p.oid)='p_case_id uuid, p_action text'
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
      and not has_function_privilege('anon',p.oid,'EXECUTE')
      and coalesce(p.proconfig @> array['search_path=""'],false)
      and position('auth.uid()' in lower(p.prosrc)) > 0
      and position('app_private.is_project_admin' in lower(p.prosrc)) > 0
    );

  v_valid := not v_app_private_exposed
    and v_governance_exposed
    and v_orchestration_exposed
    and v_anon_helper_exec=0
    and v_auth_helper_exec=4
    and v_unsafe_helper_search_path=0
    and coalesce(v_governed_admin_rpc_auth_exec,false)
    and not coalesce(v_governed_admin_rpc_anon_exec,true)
    and coalesce(v_governed_admin_rpc_guarded,false)
    and v_unapproved_exposed_privileged_functions=0;

  return jsonb_build_object(
    'valid',v_valid,
    'postgrest_schemas',v_schema_setting,
    'app_private_exposed',v_app_private_exposed,
    'governance_exposed',v_governance_exposed,
    'orchestration_exposed',v_orchestration_exposed,
    'anonymous_rls_helper_execute_count',v_anon_helper_exec,
    'authenticated_rls_helper_execute_count',v_auth_helper_exec,
    'unsafe_rls_helper_search_path_count',v_unsafe_helper_search_path,
    'unapproved_exposed_privileged_function_count',v_unapproved_exposed_privileged_functions,
    'governed_admin_recovery_rpc_authenticated',coalesce(v_governed_admin_rpc_auth_exec,false),
    'governed_admin_recovery_rpc_anonymous',coalesce(v_governed_admin_rpc_anon_exec,false),
    'governed_admin_recovery_rpc_authorization_guarded',coalesce(v_governed_admin_rpc_guarded,false),
    'rls_helper_model','Authenticated users may execute four read-only membership helpers solely for RLS evaluation; app_private is not a PostgREST exposed schema.',
    'privileged_rpc_model','Only explicitly governed SECURITY DEFINER RPCs with in-function authorization may remain authenticated-callable.'
  );
end;
$$;

revoke all on function governance.verify_database_api_security_posture() from public, anon, authenticated;
grant execute on function governance.verify_database_api_security_posture() to service_role;

do $$
declare
  v_result jsonb;
begin
  select governance.verify_database_api_security_posture() into v_result;
  if coalesce((v_result->>'valid')::boolean,false) is not true then
    raise exception 'DATABASE_API_SECURITY_POSTURE_HARDENING_FAILED: %', v_result;
  end if;
end
$$;
