-- Certify the small, intentional SECURITY DEFINER surface that remains callable
-- by authenticated users. This does not broaden any privilege. It fails closed
-- if the expected RLS helpers or governed human approval RPC drift.

create or replace function governance.verify_security_definer_advisor_exceptions()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_helper_count integer;
  v_bad_helper_count integer;
  v_interrupt_count integer;
  v_bad_interrupt_count integer;
  v_unexpected_count integer;
  v_valid boolean;
begin
  select
    count(*),
    count(*) filter (where
      not p.prosecdef
      or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or not coalesce(p.proconfig @> array['search_path=""'], false)
      or position('auth.uid()' in lower(p.prosrc)) = 0
    )
  into v_helper_count, v_bad_helper_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'app_private'
    and p.proname in ('is_org_admin','is_org_member','is_project_admin','is_project_member');

  select
    count(*),
    count(*) filter (where
      not p.prosecdef
      or not has_function_privilege('authenticated', p.oid, 'EXECUTE')
      or has_function_privilege('anon', p.oid, 'EXECUTE')
      or not coalesce(p.proconfig @> array['search_path=""'], false)
      or position('auth.uid()' in lower(p.prosrc)) = 0
      or position('app_private.is_project_admin' in lower(p.prosrc)) = 0
      or position('action_payload_hash' in lower(p.prosrc)) = 0
      or position('pending' in lower(p.prosrc)) = 0
    )
  into v_interrupt_count, v_bad_interrupt_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'agent'
    and p.proname = 'resolve_runtime_interrupt'
    and pg_catalog.pg_get_function_identity_arguments(p.oid) =
      'p_interrupt_id uuid, p_decision text, p_action_payload_hash text, p_response jsonb';

  select count(*) into v_unexpected_count
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where p.prosecdef
    and has_function_privilege('authenticated', p.oid, 'EXECUTE')
    and n.nspname in ('app_private','agent')
    and not (
      n.nspname = 'app_private'
      and p.proname in ('is_org_admin','is_org_member','is_project_admin','is_project_member')
    )
    and not (
      n.nspname = 'agent'
      and p.proname = 'resolve_runtime_interrupt'
      and pg_catalog.pg_get_function_identity_arguments(p.oid) =
        'p_interrupt_id uuid, p_decision text, p_action_payload_hash text, p_response jsonb'
    );

  v_valid := v_helper_count = 4
    and v_bad_helper_count = 0
    and v_interrupt_count = 1
    and v_bad_interrupt_count = 0
    and v_unexpected_count = 0;

  return jsonb_build_object(
    'valid', v_valid,
    'authenticated_rls_helper_count', v_helper_count,
    'invalid_rls_helper_count', v_bad_helper_count,
    'governed_interrupt_rpc_count', v_interrupt_count,
    'invalid_governed_interrupt_rpc_count', v_bad_interrupt_count,
    'unexpected_authenticated_security_definer_count', v_unexpected_count,
    'decision', 'ACCEPTED_GOVERNED_EXCEPTION',
    'rationale', 'Four non-exposed RLS membership helpers require authenticated EXECUTE for policy evaluation; one exposed agent RPC is a guarded human approval boundary.'
  );
end;
$$;

revoke all on function governance.verify_security_definer_advisor_exceptions() from public, anon, authenticated;
grant execute on function governance.verify_security_definer_advisor_exceptions() to service_role;

do $$
declare
  v_result jsonb;
begin
  select governance.verify_security_definer_advisor_exceptions() into v_result;
  if coalesce((v_result->>'valid')::boolean, false) is not true then
    raise exception 'SECURITY_DEFINER_ADVISOR_EXCEPTION_CERTIFICATION_FAILED: %', v_result;
  end if;
end
$$;
