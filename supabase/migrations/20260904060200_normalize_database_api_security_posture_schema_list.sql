create or replace function governance.verify_database_api_security_posture()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,governance
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
  v_exposed_privileged_functions integer;
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

  select count(*) into v_exposed_privileged_functions
  from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('governance','orchestration')
    and p.prosecdef=true
    and (has_function_privilege('anon',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE'));

  v_valid := not v_app_private_exposed
    and v_governance_exposed
    and v_orchestration_exposed
    and v_anon_helper_exec=0
    and v_auth_helper_exec=4
    and v_unsafe_helper_search_path=0
    and v_exposed_privileged_functions=0;

  return jsonb_build_object(
    'valid',v_valid,
    'postgrest_schemas',v_schema_setting,
    'app_private_exposed',v_app_private_exposed,
    'governance_exposed',v_governance_exposed,
    'orchestration_exposed',v_orchestration_exposed,
    'anonymous_rls_helper_execute_count',v_anon_helper_exec,
    'authenticated_rls_helper_execute_count',v_auth_helper_exec,
    'unsafe_rls_helper_search_path_count',v_unsafe_helper_search_path,
    'exposed_privileged_function_count',v_exposed_privileged_functions,
    'rls_helper_model','Authenticated users may execute four read-only membership helpers solely for RLS evaluation; app_private is not a PostgREST exposed schema.'
  );
end;
$$;

revoke execute on function governance.verify_database_api_security_posture() from public,anon,authenticated;
grant execute on function governance.verify_database_api_security_posture() to service_role;
