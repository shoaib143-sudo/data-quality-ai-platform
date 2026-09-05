create or replace function governance.refresh_all_governance_control_intelligence()
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_project record;
  v_result jsonb;
  v_results jsonb := '[]'::jsonb;
  v_project_count integer := 0;
  v_failure_count integer := 0;
  v_evaluation_count integer := 0;
  v_changed_evidence_types integer := 0;
begin
  for v_project in
    select distinct c.project_id
    from governance.control_definitions c
    where c.lifecycle_status='ACTIVE'
      and c.review_status='APPROVED'
      and c.evaluation_method='EVIDENCE_ASSERTION'
    order by c.project_id
  loop
    v_project_count := v_project_count + 1;
    begin
      v_result := governance.refresh_project_governance_control_intelligence(v_project.project_id,null);
      v_evaluation_count := v_evaluation_count + coalesce((v_result->>'evaluations')::integer,0);
      v_changed_evidence_types := v_changed_evidence_types + coalesce((v_result->>'changed_evidence_types')::integer,0);
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'project_id',v_project.project_id,
        'status','SUCCEEDED',
        'result',v_result
      ));
    exception when others then
      v_failure_count := v_failure_count + 1;
      v_results := v_results || jsonb_build_array(jsonb_build_object(
        'project_id',v_project.project_id,
        'status','FAILED',
        'error',left(sqlerrm,1000)
      ));
    end;
  end loop;

  return jsonb_build_object(
    'status',case when v_failure_count=0 then 'SUCCEEDED' else 'PARTIAL_FAILURE' end,
    'projects_refreshed',v_project_count,
    'failure_count',v_failure_count,
    'evaluations',v_evaluation_count,
    'changed_evidence_types',v_changed_evidence_types,
    'results',v_results,
    'refresh_mode','MINUTELY_RECONCILIATION',
    'database_capability_verified',true
  );
end;
$function$;

revoke execute on function governance.refresh_all_governance_control_intelligence() from public, anon, authenticated;
grant execute on function governance.refresh_all_governance_control_intelligence() to service_role;
