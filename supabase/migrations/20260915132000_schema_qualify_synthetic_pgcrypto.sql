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

  if strpos(v_source, "extensions.digest('synthetic-scope-'" ) > 0
     and strpos(v_source, "extensions.digest('synthetic-asset-'" ) > 0
     and strpos(v_source, "extensions.digest('synthetic-structure-'" ) > 0
     and strpos(v_source, "extensions.digest('synthetic-annotation-'" ) > 0
     and strpos(v_source, "extensions.digest('synthetic-manifest-'" ) > 0 then
    return;
  end if;

  if strpos(v_source, "digest('synthetic-scope-'" ) = 0
     or strpos(v_source, "digest('synthetic-asset-'" ) = 0
     or strpos(v_source, "digest('synthetic-structure-'" ) = 0
     or strpos(v_source, "digest('synthetic-annotation-'" ) = 0
     or strpos(v_source, "digest('synthetic-manifest-'" ) = 0 then
    raise exception 'Synthetic governance suite hash fixture changed; refusing pgcrypto qualification patch';
  end if;

  v_patched := replace(v_source, "digest('synthetic-scope-'", "extensions.digest('synthetic-scope-'");
  v_patched := replace(v_patched, "digest('synthetic-asset-'", "extensions.digest('synthetic-asset-'");
  v_patched := replace(v_patched, "digest('synthetic-structure-'", "extensions.digest('synthetic-structure-'");
  v_patched := replace(v_patched, "digest('synthetic-annotation-'", "extensions.digest('synthetic-annotation-'");
  v_patched := replace(v_patched, "digest('synthetic-manifest-'", "extensions.digest('synthetic-manifest-'");

  execute format(
    'create or replace function governance.run_synthetic_governance_integration_suite() returns jsonb language plpgsql volatile security definer set search_path = pg_catalog, governance, profiling, catalog, orchestration, app as %L',
    v_patched
  );
end $$;

comment on function governance.run_synthetic_governance_integration_suite() is
  'Synthetic cross-module governance integration suite. Governed JDBC readiness fixture hashes use schema-qualified extensions.digest under the restricted SECURITY DEFINER search path; synthetic evidence never counts as production learning evidence.';

commit;
