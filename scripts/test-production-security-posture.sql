\set ON_ERROR_STOP on

create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create role authenticator nologin;
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, app, agent, catalog, profiling, governance, orchestration';

create schema auth;
create schema app_private;
create schema governance;
create schema orchestration;

grant usage on schema governance, orchestration to authenticated, service_role;
grant usage on schema app_private to authenticated, service_role;

create or replace function auth.uid() returns uuid language sql stable as $$ select '00000000-0000-0000-0000-000000000001'::uuid $$;

create or replace function app_private.is_org_admin(uuid) returns boolean language sql security definer set search_path='' as $$ select true $$;
create or replace function app_private.is_org_member(uuid) returns boolean language sql security definer set search_path='' as $$ select true $$;
create or replace function app_private.is_project_admin(uuid) returns boolean language sql security definer set search_path='' as $$ select true $$;
create or replace function app_private.is_project_member(uuid) returns boolean language sql security definer set search_path='' as $$ select true $$;
revoke all on function app_private.is_org_admin(uuid) from public, anon;
revoke all on function app_private.is_org_member(uuid) from public, anon;
revoke all on function app_private.is_project_admin(uuid) from public, anon;
revoke all on function app_private.is_project_member(uuid) from public, anon;
grant execute on function app_private.is_org_admin(uuid) to authenticated, service_role;
grant execute on function app_private.is_org_member(uuid) to authenticated, service_role;
grant execute on function app_private.is_project_admin(uuid) to authenticated, service_role;
grant execute on function app_private.is_project_member(uuid) to authenticated, service_role;

create or replace function orchestration.capture_terminal_recovery_case() returns trigger language plpgsql security definer set search_path='' as $$ begin return new; end $$;
create or replace function orchestration.enforce_recovery_retry_ceiling() returns trigger language plpgsql security definer set search_path='' as $$ begin return new; end $$;
create or replace function orchestration.resolve_execution_recovery_after_success() returns trigger language plpgsql security definer set search_path='' as $$ begin return new; end $$;

create or replace function orchestration.request_execution_recovery_action_admin(p_case_id uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'Authentication is required.'; end if;
  if not app_private.is_project_admin(p_case_id) then raise exception 'Admin required.'; end if;
  return jsonb_build_object('ok', true, 'action', p_action);
end
$$;

grant execute on function orchestration.capture_terminal_recovery_case() to public, anon, authenticated;
grant execute on function orchestration.enforce_recovery_retry_ceiling() to public, anon, authenticated;
grant execute on function orchestration.resolve_execution_recovery_after_success() to public, anon, authenticated;
grant execute on function orchestration.request_execution_recovery_action_admin(uuid,text) to authenticated;

\ir ../supabase/migrations/20260912191500_harden_production_api_security_posture.sql

do $$
declare
  v_result jsonb;
begin
  if has_function_privilege('anon','orchestration.capture_terminal_recovery_case()','EXECUTE')
    or has_function_privilege('authenticated','orchestration.capture_terminal_recovery_case()','EXECUTE') then
    raise exception 'capture_terminal_recovery_case remained API-callable';
  end if;
  if has_function_privilege('anon','orchestration.enforce_recovery_retry_ceiling()','EXECUTE')
    or has_function_privilege('authenticated','orchestration.enforce_recovery_retry_ceiling()','EXECUTE') then
    raise exception 'enforce_recovery_retry_ceiling remained API-callable';
  end if;
  if has_function_privilege('anon','orchestration.resolve_execution_recovery_after_success()','EXECUTE')
    or has_function_privilege('authenticated','orchestration.resolve_execution_recovery_after_success()','EXECUTE') then
    raise exception 'resolve_execution_recovery_after_success remained API-callable';
  end if;
  if not has_function_privilege('authenticated','orchestration.request_execution_recovery_action_admin(uuid,text)','EXECUTE') then
    raise exception 'governed admin recovery RPC lost authenticated execution';
  end if;
  if has_function_privilege('anon','orchestration.request_execution_recovery_action_admin(uuid,text)','EXECUTE') then
    raise exception 'governed admin recovery RPC became anonymously callable';
  end if;

  select governance.verify_database_api_security_posture() into v_result;
  if coalesce((v_result->>'valid')::boolean,false) is not true then
    raise exception 'expected hardened posture to be valid: %', v_result;
  end if;
end
$$;

create or replace function governance.intentionally_bad_exposed_function()
returns boolean
language sql
security definer
set search_path=''
as $$ select true $$;
grant execute on function governance.intentionally_bad_exposed_function() to authenticated;

do $$
declare
  v_result jsonb;
begin
  select governance.verify_database_api_security_posture() into v_result;
  if coalesce((v_result->>'valid')::boolean,true) is not false then
    raise exception 'posture verifier failed open after new privileged function exposure: %', v_result;
  end if;
  if coalesce((v_result->>'unapproved_exposed_privileged_function_count')::integer,0) < 1 then
    raise exception 'expected exposed privileged function count to increase: %', v_result;
  end if;
end
$$;

revoke all on function governance.intentionally_bad_exposed_function() from public, anon, authenticated;
drop function governance.intentionally_bad_exposed_function();

select 'Production security posture dynamic/negative tests passed.' as result;
