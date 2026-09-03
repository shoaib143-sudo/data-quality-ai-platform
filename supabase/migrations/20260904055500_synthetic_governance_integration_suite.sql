create table if not exists governance.integration_test_runs (
  id uuid primary key default gen_random_uuid(),
  suite_name text not null default 'governance_e2e',
  status text not null default 'RUNNING' check(status in ('RUNNING','PASSED','FAILED')),
  checks jsonb not null default '{}'::jsonb,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table governance.integration_test_runs enable row level security;
drop policy if exists integration_test_runs_explicit_deny on governance.integration_test_runs;
create policy integration_test_runs_explicit_deny on governance.integration_test_runs
for all to authenticated using (false) with check (false);
revoke all on governance.integration_test_runs from anon,authenticated;
grant all on governance.integration_test_runs to service_role;

create or replace function governance.run_synthetic_governance_integration_suite()
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
  v_profile_id uuid;
  v_contract_id uuid;
  v_contract_version_id uuid;
  v_rule_id uuid;
  v_workflow_id uuid;
  v_instance_id uuid;
  v_contract_result jsonb;
  v_workflow_result jsonb;
  v_checks jsonb := '{}'::jsonb;
  v_count integer;
  v_status text;
  v_error text;
  v_suffix text := replace(gen_random_uuid()::text,'-','');
begin
  insert into governance.integration_test_runs default values returning id into v_run_id;

  begin
    insert into app.organizations(name,slug,metadata)
    values('Governance Integration Test','gov-it-'||left(v_suffix,12),jsonb_build_object('synthetic',true,'integration_run_id',v_run_id))
    returning id into v_org_id;

    insert into app.projects(organization_id,name,slug,description,metadata)
    values(v_org_id,'Governance Integration Test','gov-it-'||left(v_suffix,12),'Synthetic cross-module integration validation.',jsonb_build_object('synthetic',true,'integration_run_id',v_run_id))
    returning id into v_project_id;

    insert into catalog.datasets(project_id,name,source_identifier,business_domain,metadata)
    values(v_project_id,'Synthetic Governed Dataset','profiling_validation.synthetic_customers','TEST',jsonb_build_object('synthetic',true,'profiling_ready',true))
    returning id into v_dataset_id;

    insert into catalog.dataset_versions(dataset_id,version_number,source_uri,status,row_count,column_count,schema_hash,metadata)
    values(v_dataset_id,1,'table://profiling_validation.synthetic_customers','AVAILABLE',10,4,'schema-v1',jsonb_build_object('synthetic',true,'profiling_ready',true))
    returning id into v_version_id;

    insert into profiling.dataset_execution_sources(dataset_version_id,source_type,source_uri,execution_config,active)
    values(v_version_id,'TABLE','table://profiling_validation.synthetic_customers',jsonb_build_object('schema','profiling_validation','table','synthetic_customers'),true);

    insert into governance.dataset_catalog(dataset_id,project_id,lifecycle_status,certification_status,criticality,business_description,metadata)
    values(v_dataset_id,v_project_id,'ACTIVE','CERTIFIED','HIGH','Synthetic certified dataset for integration validation.',jsonb_build_object('synthetic',true));

    insert into governance.data_contracts(project_id,dataset_id,name,status,current_version)
    values(v_project_id,v_dataset_id,'Synthetic Contract','ACTIVE',1)
    returning id into v_contract_id;

    insert into governance.data_contract_versions(contract_id,version_number,schema_hash,compatibility_policy,row_count_min,row_count_max,quality_requirements,status,effective_at)
    values(v_contract_id,1,'schema-v1','BACKWARD',5,20,jsonb_build_object('min_overall_score',0.95,'min_completeness_score',0.95),'ACTIVE',now())
    returning id into v_contract_version_id;

    insert into profiling.profile_runs(dataset_version_id,status,engine_name,engine_version,row_count,column_count,schema_hash,summary)
    values(v_version_id,'RUNNING','integration-suite','1.0',10,4,'schema-v1',jsonb_build_object('investigation',jsonb_build_object('status','COMPLETED'),'synthetic',true))
    returning id into v_profile_id;

    insert into profiling.data_quality_scores(profile_run_id,completeness_score,uniqueness_score,validity_score,overall_score)
    values(v_profile_id,0.90,1.0,1.0,0.90);

    update profiling.profile_runs set status='COMPLETED',completed_at=now() where id=v_profile_id;

    select status into v_status from governance.data_contract_evaluations where contract_version_id=v_contract_version_id and profile_run_id=v_profile_id;
    v_checks := v_checks || jsonb_build_object('data_contract_failure',v_status='FAILED');
    if v_status is distinct from 'FAILED' then raise exception 'Data contract failure was not persisted'; end if;

    select certification_status into v_status from governance.dataset_catalog where dataset_id=v_dataset_id;
    v_checks := v_checks || jsonb_build_object('certification_invalidation',v_status='EXPIRED');
    if v_status is distinct from 'EXPIRED' then raise exception 'Certification was not invalidated by contract failure'; end if;

    select count(*) into v_count from orchestration.event_outbox where project_id=v_project_id and event_type='PROFILE_COMPLETED';
    v_checks := v_checks || jsonb_build_object('profile_completed_outbox',v_count=1);
    if v_count<>1 then raise exception 'PROFILE_COMPLETED outbox event was not emitted exactly once'; end if;

    insert into profiling.quality_rule_definitions(project_id,dataset_id,dataset_version_id,rule_key,name,dimension,severity,metric_key,operator,threshold,enabled,origin,rule_type,rule_config)
    values(v_project_id,v_dataset_id,v_version_id,'synthetic.required','Synthetic Required Rule','COMPLETENESS','HIGH','null_rate','LTE',0,true,'CUSTOM','METRIC_THRESHOLD','{}'::jsonb)
    returning id into v_rule_id;

    update profiling.quality_rule_definitions set threshold=0.01 where id=v_rule_id;
    select count(*) into v_count from governance.object_revisions where entity_type='profiling.quality_rule_definitions' and entity_id=v_rule_id;
    v_checks := v_checks || jsonb_build_object('governance_object_revision',v_count>=2);
    if v_count<2 then raise exception 'Quality rule revision history was not captured'; end if;

    insert into profiling.quality_rule_runs(rule_definition_id,dataset_version_id,profile_run_id,status,passed,observed_value,threshold,evidence,completed_at)
    values(v_rule_id,v_version_id,v_profile_id,'FAILED',false,0.2,0.01,jsonb_build_object('synthetic',true),now());

    select count(*) into v_count from orchestration.event_outbox where project_id=v_project_id and event_type='QUALITY_RULE_EVALUATED';
    v_checks := v_checks || jsonb_build_object('quality_rule_outbox',v_count=1);
    if v_count<>1 then raise exception 'QUALITY_RULE_EVALUATED outbox event was not emitted exactly once'; end if;

    insert into governance.workflow_definitions(project_id,workflow_key,name,entity_type,version,steps,enabled)
    values(v_project_id,'synthetic-certification','Synthetic Certification Workflow','DATASET',1,'[{"name":"Steward review"},{"name":"Owner approval"}]'::jsonb,true)
    returning id into v_workflow_id;

    v_instance_id := governance.start_workflow(v_workflow_id,'DATASET',v_dataset_id,null,jsonb_build_object('synthetic',true));
    perform governance.act_workflow(v_instance_id,null,'APPROVE','Synthetic steward approval','{}'::jsonb);
    v_workflow_result := governance.act_workflow(v_instance_id,null,'APPROVE','Synthetic owner approval','{}'::jsonb);
    v_checks := v_checks || jsonb_build_object('workflow_completion',v_workflow_result->>'status'='APPROVED');
    if v_workflow_result->>'status'<>'APPROVED' then raise exception 'Configurable workflow did not complete as APPROVED'; end if;

    select governance.evaluate_data_contract(v_profile_id) into v_contract_result;
    v_checks := v_checks || jsonb_build_object('contract_idempotency',v_contract_result->>'status'='FAILED');
    if v_contract_result->>'status'<>'FAILED' then raise exception 'Data contract re-evaluation was not idempotent'; end if;

    delete from app.organizations where id=v_org_id;
    v_org_id := null;

    update governance.integration_test_runs set status='PASSED',checks=v_checks,completed_at=now() where id=v_run_id;
    return jsonb_build_object('run_id',v_run_id,'status','PASSED','checks',v_checks);
  exception when others then
    v_error := sqlerrm;
    if v_org_id is not null then delete from app.organizations where id=v_org_id; end if;
    update governance.integration_test_runs set status='FAILED',checks=v_checks,error_message=v_error,completed_at=now() where id=v_run_id;
    return jsonb_build_object('run_id',v_run_id,'status','FAILED','checks',v_checks,'error',v_error);
  end;
end;
$function$;

revoke execute on function governance.run_synthetic_governance_integration_suite() from public,anon,authenticated;
grant execute on function governance.run_synthetic_governance_integration_suite() to service_role;

select pg_notify('pgrst','reload schema');
