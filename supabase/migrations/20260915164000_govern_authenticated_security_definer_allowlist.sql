-- Govern the small set of authenticated-callable SECURITY DEFINER functions that are intentional.
-- This migration does not broaden access. It reasserts explicit grants, removes PUBLIC/anon execution,
-- and installs a fail-closed verifier so any additional authenticated privileged function in an application
-- schema becomes a release failure.

revoke all on function app_private.is_org_admin(uuid) from public, anon;
revoke all on function app_private.is_org_member(uuid) from public, anon;
revoke all on function app_private.is_project_admin(uuid) from public, anon;
revoke all on function app_private.is_project_member(uuid) from public, anon;
revoke all on function agent.resolve_runtime_interrupt(uuid, text, text, jsonb) from public, anon;

grant execute on function app_private.is_org_admin(uuid) to authenticated, service_role;
grant execute on function app_private.is_org_member(uuid) to authenticated, service_role;
grant execute on function app_private.is_project_admin(uuid) to authenticated, service_role;
grant execute on function app_private.is_project_member(uuid) to authenticated, service_role;
grant execute on function agent.resolve_runtime_interrupt(uuid, text, text, jsonb) to authenticated, service_role;

create or replace function governance.verify_authenticated_security_definer_allowlist()
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'governance'
as $$
declare
  v_schema_setting text;
  v_app_private_exposed boolean;
  v_helper_count integer;
  v_helper_anon_exec integer;
  v_helper_auth_exec integer;
  v_helper_unsafe_search_path integer;
  v_interrupt_auth_exec boolean;
  v_interrupt_anon_exec boolean;
  v_interrupt_guarded boolean;
  v_unexpected_authenticated_exec integer;
  v_valid boolean;
begin
  select split_part(setting, '=', 2)
    into v_schema_setting
  from (
    select unnest(s.setconfig) setting
    from pg_db_role_setting s
    join pg_roles r on r.oid = s.setrole
    where r.rolname = 'authenticator'
      and (s.setdatabase = 0 or s.setdatabase = (select oid from pg_database where datname = current_database()))
  ) settings
  where setting like 'pgrst.db_schemas=%'
  limit 1;

  v_app_private_exposed := coalesce(
    'app_private' = any(string_to_array(replace(coalesce(v_schema_setting, ''), ' ', ''), ',')),
    false
  );

  select
    count(*),
    count(*) filter (where has_function_privilege('anon', p.oid, 'EXECUTE')),
    count(*) filter (where has_function_privilege('authenticated', p.oid, 'EXECUTE')),
    count(*) filter (where not coalesce(p.proconfig @> array['search_path=""'], false))
  into
    v_helper_count,
    v_helper_anon_exec,
    v_helper_auth_exec,
    v_helper_unsafe_search_path
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private'
    and p.proname in ('is_org_admin', 'is_org_member', 'is_project_admin', 'is_project_member')
    and pg_get_function_identity_arguments(p.oid) in ('p_org_id uuid', 'p_project_id uuid')
    and p.prosecdef = true;

  select
    has_function_privilege('authenticated', p.oid, 'EXECUTE'),
    has_function_privilege('anon', p.oid, 'EXECUTE'),
    coalesce(p.proconfig @> array['search_path=""'], false)
      and position('auth.uid()' in lower(p.prosrc)) > 0
      and position('app_private.is_project_admin' in lower(p.prosrc)) > 0
      and position('for update of i' in lower(p.prosrc)) > 0
      and position('action_payload_hash' in lower(p.prosrc)) > 0
      and position('expires_at' in lower(p.prosrc)) > 0
  into v_interrupt_auth_exec, v_interrupt_anon_exec, v_interrupt_guarded
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'agent'
    and p.proname = 'resolve_runtime_interrupt'
    and pg_get_function_identity_arguments(p.oid) = 'p_interrupt_id uuid, p_decision text, p_action_payload_hash text, p_response jsonb'
    and p.prosecdef = true;

  select count(*)
    into v_unexpected_authenticated_exec
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'app', 'app_private', 'agent', 'catalog', 'profiling', 'governance', 'orchestration')
    and p.prosecdef = true
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and not (
      n.nspname = 'app_private'
      and p.proname in ('is_org_admin', 'is_org_member', 'is_project_admin', 'is_project_member')
      and pg_get_function_identity_arguments(p.oid) in ('p_org_id uuid', 'p_project_id uuid')
    )
    and not (
      n.nspname = 'agent'
      and p.proname = 'resolve_runtime_interrupt'
      and pg_get_function_identity_arguments(p.oid) = 'p_interrupt_id uuid, p_decision text, p_action_payload_hash text, p_response jsonb'
    )
    and not (
      n.nspname = 'orchestration'
      and p.proname = 'request_execution_recovery_action_admin'
      and pg_get_function_identity_arguments(p.oid) = 'p_case_id uuid, p_action text'
    );

  v_valid := not v_app_private_exposed
    and v_helper_count = 4
    and v_helper_anon_exec = 0
    and v_helper_auth_exec = 4
    and v_helper_unsafe_search_path = 0
    and coalesce(v_interrupt_auth_exec, false)
    and not coalesce(v_interrupt_anon_exec, true)
    and coalesce(v_interrupt_guarded, false)
    and v_unexpected_authenticated_exec = 0;

  return jsonb_build_object(
    'valid', v_valid,
    'postgrest_schemas', v_schema_setting,
    'app_private_exposed', v_app_private_exposed,
    'membership_helper_count', v_helper_count,
    'membership_helper_authenticated_execute_count', v_helper_auth_exec,
    'membership_helper_anonymous_execute_count', v_helper_anon_exec,
    'membership_helper_unsafe_search_path_count', v_helper_unsafe_search_path,
    'runtime_interrupt_authenticated_execute', coalesce(v_interrupt_auth_exec, false),
    'runtime_interrupt_anonymous_execute', coalesce(v_interrupt_anon_exec, false),
    'runtime_interrupt_authorization_guarded', coalesce(v_interrupt_guarded, false),
    'unexpected_authenticated_security_definer_count', v_unexpected_authenticated_exec,
    'model', 'Four unexposed RLS membership helpers and two explicitly governed authenticated privileged RPCs are the complete application-schema allowlist.'
  );
end;
$$;

revoke all on function governance.verify_authenticated_security_definer_allowlist() from public, anon, authenticated;
grant execute on function governance.verify_authenticated_security_definer_allowlist() to service_role;

do $$
declare
  v_result jsonb;
begin
  select governance.verify_authenticated_security_definer_allowlist() into v_result;
  if coalesce((v_result ->> 'valid')::boolean, false) is not true then
    raise exception 'AUTHENTICATED_SECURITY_DEFINER_ALLOWLIST_FAILED: %', v_result;
  end if;
end
$$;
