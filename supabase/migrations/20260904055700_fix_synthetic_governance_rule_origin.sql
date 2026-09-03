do $$
declare v_definition text;
begin
  select pg_get_functiondef(p.oid) into v_definition
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='governance'
    and p.proname='run_synthetic_governance_integration_suite'
    and pg_get_function_identity_arguments(p.oid)='';
  if v_definition is null then
    raise exception 'Synthetic governance integration function not found';
  end if;
  v_definition := replace(
    v_definition,
    $old$,true,'CUSTOM','METRIC_THRESHOLD'$old$,
    $new$,true,'SYSTEM','METRIC_THRESHOLD'$new$
  );
  execute v_definition;
end $$;

revoke execute on function governance.run_synthetic_governance_integration_suite() from public,anon,authenticated;
grant execute on function governance.run_synthetic_governance_integration_suite() to service_role;
