begin;

do $$
declare
  v_source text;
  v_patched text;
begin
  select p.prosrc
    into v_source
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'governance'
    and p.proname = 'run_synthetic_governance_integration_suite'
    and pg_get_function_identity_arguments(p.oid) = '';

  if v_source is null then
    raise exception 'governance.run_synthetic_governance_integration_suite() is missing';
  end if;

  if strpos(v_source, 'encode(digest(') = 0 then
    if strpos(v_source, 'pg_catalog.encode(extensions.digest(') > 0 then
      return;
    end if;
    raise exception 'Synthetic governance suite hash expression changed; refusing search-path patch';
  end if;

  v_patched := replace(v_source, 'encode(digest(', 'pg_catalog.encode(extensions.digest(');

  execute format(
    'create or replace function governance.run_synthetic_governance_integration_suite() returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, governance, profiling, catalog, orchestration, app as %L',
    v_patched
  );
end
$$;

revoke execute on function governance.run_synthetic_governance_integration_suite() from public, anon, authenticated;
grant execute on function governance.run_synthetic_governance_integration_suite() to service_role;

comment on function governance.run_synthetic_governance_integration_suite() is
  'Self-cleaning cross-module integration suite with governed JDBC readiness evidence and schema-qualified pgcrypto hashing under its restricted SECURITY DEFINER search path.';

commit;
