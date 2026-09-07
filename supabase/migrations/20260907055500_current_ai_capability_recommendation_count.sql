do $$
declare
  v_definition text;
  v_old text := '(select count(*) from governance.ai_governance_suggestions where project_id=p_project_id) as governance_recommendations';
  v_new text := '(select governance.current_ai_governance_recommendation_count(p_project_id)) as governance_recommendations';
begin
  select pg_get_functiondef('governance.generate_ai_capability_matrix(uuid)'::regprocedure)
    into v_definition;

  if position(v_old in v_definition) = 0 then
    raise exception 'generate_ai_capability_matrix governance recommendation count clause has drifted';
  end if;

  v_definition := replace(v_definition, v_old, v_new);
  execute v_definition;
end
$$;

comment on function governance.generate_ai_capability_matrix(uuid) is
  'Returns the 75-capability evidence matrix. Capability 59 counts distinct current non-expired AI governance recommendation contexts, while historical suggestion rows remain preserved for audit.';
