do $$
declare
  v_result jsonb;
begin
  v_result := governance.run_synthetic_governance_integration_suite();

  if v_result->>'status' is distinct from 'PASSED' then
    raise exception 'Synthetic governance integration suite failed: %', v_result;
  end if;

  if jsonb_typeof(v_result->'checks') is distinct from 'object'
     or coalesce(
       (select bool_and(value = 'true'::jsonb) from jsonb_each(v_result->'checks')),
       false
     ) is not true then
    raise exception 'Synthetic governance integration suite returned incomplete or failing checks: %', v_result;
  end if;
end
$$;
