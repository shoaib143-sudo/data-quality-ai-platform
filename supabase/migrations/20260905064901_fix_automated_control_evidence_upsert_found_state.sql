do $migration_guard$
begin
  if position('v_existing_found' in pg_get_functiondef('governance.refresh_governance_control_evidence(uuid,uuid,uuid,uuid)'::regprocedure)) = 0 then
    raise exception 'Automated control evidence collector must preserve the evidence lookup result before set_config changes PL/pgSQL FOUND state';
  end if;
end;
$migration_guard$;
