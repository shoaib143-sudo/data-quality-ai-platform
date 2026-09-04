create or replace function governance.run_synthetic_profiling_remediation_state_machine_suite()
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,governance,profiling,catalog,orchestration,app
as $function$
declare
  v_run_id uuid;
  v_org_id uuid;
  v_project_id uuid;
  v_dataset_id uuid;
  v_version_id uuid;
  v_profile_run_id uuid;
  v_definition_id uuid;
  v_instance_id uuid;
  v_job_id uuid;
  v_claim boolean;
  v_checks jsonb := '{}'::jsonb;
  v_error text;
  v_suffix text := replace(gen_random_uuid()::text,'-','');
begin
  insert into governance.integration_test_runs(suite_name)
  values('profiling_remediation_state_machine')
  returning id into v_run_id;

  begin
    insert into app.organizations(name,slug,metadata)
    values(
      'Synthetic Remediation State Machine',
      'remediation-sm-'||left(v_suffix,12),
      jsonb_build_object('synthetic',true,'integration_run_id',v_run_id)
    )
    returning id into v_org_id;

    insert into app.projects(organization_id,name,slug,description,metadata)
    values(
      v_org_id,
      'Synthetic Remediation State Machine',
      'remediation-sm-'||left(v_suffix,12),
      'Synthetic isolated project for profiling remediation orchestration validation.',
      jsonb_build_object('synthetic',true,'integration_run_id',v_run_id)
    )
    returning id into v_project_id;

    insert into catalog.datasets(project_id,name,source_identifier,business_domain,metadata)
    values(
      v_project_id,
      'Synthetic Remediation Dataset',
      'synthetic.remediation_state_machine',
      'TEST',
      jsonb_build_object('synthetic',true)
    )
    returning id into v_dataset_id;

    insert into catalog.dataset_versions(dataset_id,version_number,source_uri,status,metadata)
    values(
      v_dataset_id,
      1,
      'synthetic://remediation-state-machine',
      'AVAILABLE',
      jsonb_build_object('synthetic',true)
    )
    returning id into v_version_id;

    insert into profiling.profile_runs(dataset_version_id,status,engine_name,engine_version,summary)
    values(
      v_version_id,
      'RUNNING',
      'synthetic-remediation-state-machine',
      '1.0',
      jsonb_build_object('synthetic',true,'integration_run_id',v_run_id)
    )
    returning id into v_profile_run_id;

    insert into governance.workflow_definitions(project_id,workflow_key,name,entity_type,version,steps,enabled)
    values(
      v_project_id,
      'synthetic-remediation-state-machine',
      'Synthetic Remediation State Machine',
      'PROFILE_RUN',
      1,
      '[{"index":0,"name":"Synthetic approval","capability":"policy.approve"}]'::jsonb,
      true
    )
    returning id into v_definition_id;

    insert into governance.workflow_instances(
      project_id,workflow_definition_id,entity_type,entity_id,status,current_step,context,completed_at
    )
    values(
      v_project_id,
      v_definition_id,
      'PROFILE_RUN',
      v_profile_run_id,
      'APPROVED',
      1,
      jsonb_build_object('synthetic',true,'integration_run_id',v_run_id),
      now()
    )
    returning id into v_instance_id;

    insert into governance.profiling_remediation_outcomes(
      project_id,workflow_instance_id,source_profile_run_id,status,execution_mode,
      production_mutation_performed,remediation_issue_ids
    )
    values(
      v_project_id,
      v_instance_id,
      v_profile_run_id,
      'ACTION_TRACKED',
      'TRACKED_GOVERNANCE_ISSUES_ONLY',
      false,
      '{}'::uuid[]
    );

    select governance.claim_profiling_remediation_verification(v_instance_id,null) into v_claim;
    v_checks := v_checks || jsonb_build_object('initial_claim',v_claim is true);
    if v_claim is distinct from true then raise exception 'Initial verification claim should succeed'; end if;

    select governance.claim_profiling_remediation_verification(v_instance_id,null) into v_claim;
    v_checks := v_checks || jsonb_build_object('immediate_duplicate_blocked',v_claim is false);
    if v_claim is distinct from false then raise exception 'Immediate duplicate verification claim should be blocked'; end if;

    update governance.profiling_remediation_outcomes
    set verification_requested_at=now()-interval '16 minutes'
    where workflow_instance_id=v_instance_id;

    select governance.claim_profiling_remediation_verification(v_instance_id,null) into v_claim;
    v_checks := v_checks || jsonb_build_object('stale_unlinked_claim_recovered',v_claim is true);
    if v_claim is distinct from true then raise exception 'Stale unlinked verification claim should recover'; end if;

    insert into orchestration.job_queue(
      project_id,job_type,entity_id,payload,idempotency_key
    )
    values(
      v_project_id,
      'PROFILING',
      v_profile_run_id,
      jsonb_build_object(
        'source','SYNTHETIC_REMEDIATION_STATE_MACHINE',
        'workflowInstanceId',v_instance_id,
        'verificationProfileRunId',v_profile_run_id
      ),
      'synthetic:remediation-verification:'||v_instance_id::text
    )
    returning id into v_job_id;

    update governance.profiling_remediation_outcomes
    set verification_job_id=v_job_id,
        verification_requested_at=now()-interval '16 minutes'
    where workflow_instance_id=v_instance_id;

    select governance.claim_profiling_remediation_verification(v_instance_id,null) into v_claim;
    v_checks := v_checks || jsonb_build_object('linked_job_blocks_reclaim',v_claim is false);
    if v_claim is distinct from false then raise exception 'Linked verification job must block duplicate claim'; end if;

    delete from app.organizations where id=v_org_id;
    v_org_id := null;

    if exists(select 1 from app.projects where id=v_project_id) then
      raise exception 'Synthetic project cleanup failed';
    end if;

    v_checks := v_checks || jsonb_build_object('synthetic_cleanup',true);

    update governance.integration_test_runs
    set status='PASSED',checks=v_checks,completed_at=now()
    where id=v_run_id;

    return jsonb_build_object('run_id',v_run_id,'status','PASSED','checks',v_checks);
  exception when others then
    v_error := sqlerrm;
    if v_org_id is not null then
      delete from app.organizations where id=v_org_id;
    end if;
    update governance.integration_test_runs
    set status='FAILED',checks=v_checks,error_message=v_error,completed_at=now()
    where id=v_run_id;
    return jsonb_build_object('run_id',v_run_id,'status','FAILED','checks',v_checks,'error',v_error);
  end;
end;
$function$;

revoke all on function governance.run_synthetic_profiling_remediation_state_machine_suite() from public;
revoke all on function governance.run_synthetic_profiling_remediation_state_machine_suite() from anon;
revoke all on function governance.run_synthetic_profiling_remediation_state_machine_suite() from authenticated;
grant execute on function governance.run_synthetic_profiling_remediation_state_machine_suite() to service_role;

select pg_notify('pgrst','reload schema');