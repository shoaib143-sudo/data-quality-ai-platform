-- Capability #45 is "Verification after remediation". Mere remediation tracking is
-- not verification evidence. Count only terminal VERIFIED remediation outcomes.
do $$
declare
  v_definition text;
  v_updated text;
  v_old text := '((select count(*) from governance.profiling_remediation_outcomes where project_id=p_project_id)+(select count(*) from governance.data_quality_remediation_outcomes where project_id=p_project_id)) as remediation_outcome';
  v_new text := '((select count(*) from governance.profiling_remediation_outcomes where project_id=p_project_id and status=''VERIFIED'')+(select count(*) from governance.data_quality_remediation_outcomes where project_id=p_project_id and status=''VERIFIED'')) as remediation_outcome';
begin
  select pg_get_functiondef('governance.generate_ai_capability_matrix(uuid)'::regprocedure)
  into v_definition;

  if strpos(v_definition, v_old) = 0 then
    raise exception 'generate_ai_capability_matrix remediation evidence clause has drifted; refusing unsafe replacement';
  end if;

  v_updated := replace(v_definition, v_old, v_new);
  if v_updated = v_definition then
    raise exception 'Capability 45 verified-remediation replacement did not change function definition';
  end if;

  execute v_updated;
end $$;

comment on function governance.generate_ai_capability_matrix(uuid) is
'Returns the evidence-backed 75 AI capability matrix. Capability 45 counts only VERIFIED remediation outcomes; tracked/planned remediation is not verification evidence.';
