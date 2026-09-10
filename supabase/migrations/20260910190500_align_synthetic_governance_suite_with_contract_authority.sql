begin;

create or replace function governance.run_synthetic_governance_integration_suite()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, profiling, catalog, orchestration, app
as $$
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
    values(v_dataset_id,1,'table://profiling_validation.synthetic_customers','AVAILABLE',10,0,'schema-v1',jsonb_build_object('synthetic',true,'profiling_ready',true))
    returning id into v_version_id;

    insert into profiling.dataset_execution_sources(dataset_version_id,source_type,source_uri,execution_config,active)
    values(v_version_id,'TABLE','table://profiling_validation.synthetic_customers',jsonb_build_object('schema','profiling_validation','table','synthetic_customers'),true);

    insert into governance.dataset_catalog(dataset_id,project_id,lifecycle_status,certification_status,criticality,business_description,metadata)
    values(v_dataset_id,v_project_id,'ACTIVE','CERTIFIED','HIGH','Synthetic certified dataset for integration validation.',jsonb_build_object('synthetic',true));

    -- Synthetic certification must never manufacture human approval evidence.
    -- Keep the contract/version non-authoritative and assert the production guard
    -- rejects direct activation without an approved effective current version.
    insert into governance.data_contracts(project_id,dataset_id,name,status,current_version)
    values(v_project_id,v_dataset_id,'Synthetic Contract','DRAFT',1)
    returning id into v_contract_id;

    insert into governance.data_contract_versions(
      contract_id,version_number,schema_hash,compatibility_policy,row_count_min,row_count_max,
      quality_requirements,status,authority_status,effective_at
    )
    values(
      v_contract_id,1,'schema-v1','BACKWARD',5,20,
      jsonb_build_object('min_overall_score',0.95,'min_completeness_score',0.95),
      'DRAFT','UNVERIFIED',null
    )
    returning id into v_contract_version_id;

    begin
      update governance.data_contracts
      set status='ACTIVE',current_version=1,current_version_id=v_contract_version_id,updated_at=now()
      where id=v_contract_id;
      raise exception 'Synthetic activation unexpectedly bypassed data contract authority guard';
    exception when others then
      if sqlerrm <> 'Active data contract requires an approved effective current version' then
        raise;
      end if;
      v_checks := v_checks || jsonb_build_object('data_contract_authority_fail_closed',true);
    end;

    insert into profiling.profile_runs(dataset_version_id,status,engine_name,engine_version,row_count,column_count,schema_hash,summary)
    values(v_version_id,'RUNNING','integration-suite','1.0',10,0,'schema-v1',jsonb_build_object('investigation',jsonb_build_object('status','COMPLETED'),'synthetic',true))
    returning id into v_profile_id;

    insert into profiling.profile_metrics(profile_run_id,metric_definition_id,metric_key,numeric_value,text_value)
    select v_profile_id,md.id,md.metric_key,
      case md.metric_key when 'row_count' then 10::numeric when 'column_count' then 0::numeric when 'duplicate_row_count' then 0::numeric when 'duplicate_row_rate' then 0::numeric else null end,
      case when md.metric_key='schema_hash' then 'schema-v1' else null end
    from profiling.metric_definitions md
    where md.enabled=true and md.scope='DATASET';

    select count(*) into v_count
    from profiling.profile_metrics pm
    join profiling.metric_definitions md on md.id=pm.metric_definition_id
    where pm.profile_run_id=v_profile_id and pm.profile_column_id is null and md.enabled=true and md.scope='DATASET';
    v_checks := v_checks || jsonb_build_object('profiling_metric_contract_dataset_metrics',v_count=(select count(*) from profiling.metric_definitions where enabled=true and scope='DATASET'));
    if not (v_checks->>'profiling_metric_contract_dataset_metrics')::boolean then
      raise exception 'Synthetic profiling dataset metrics are incomplete';
    end if;

    insert into profiling.data_quality_scores(profile_run_id,completeness_score,uniqueness_score,validity_score,overall_score)
    values(v_profile_id,0.90,1.0,1.0,0.90);

    update profiling.profile_runs set status='COMPLETED',completed_at=now() where id=v_profile_id;

    select governance.evaluate_data_contract(v_profile_id) into v_contract_result;
    v_checks := v_checks || jsonb_build_object('unapproved_contract_not_authoritative',v_contract_result->>'status'='NO_CONTRACT');
    if v_contract_result->>'status' <> 'NO_CONTRACT' then
      raise exception 'Unapproved data contract was treated as authoritative';
    end if;

    select certification_status into v_status from governance.dataset_catalog where dataset_id=v_dataset_id;
    v_checks := v_checks || jsonb_build_object('unapproved_contract_does_not_invalidate_certification',v_status='CERTIFIED');
    if v_status is distinct from 'CERTIFIED' then
      raise exception 'Non-authoritative data contract changed certification state';
    end if;

    select count(*) into v_count
    from orchestration.event_outbox
    where project_id=v_project_id and event_type='PROFILE_COMPLETED';
    v_checks := v_checks || jsonb_build_object('profile_completed_outbox',v_count=1);
    if v_count<>1 then raise exception 'PROFILE_COMPLETED outbox event was not emitted exactly once'; end if;

    insert into profiling.quality_rule_definitions(
      project_id,dataset_id,dataset_version_id,rule_key,name,dimension,severity,metric_key,
      operator,threshold,enabled,origin,rule_type,rule_config
    ) values(
      v_project_id,v_dataset_id,v_version_id,'synthetic.required','Synthetic Required Rule',
      'COMPLETENESS','HIGH','null_rate','LTE',0,true,'SYSTEM','METRIC_THRESHOLD','{}'::jsonb
    ) returning id into v_rule_id;

    update profiling.quality_rule_definitions set threshold=0.01 where id=v_rule_id;
    select count(*) into v_count
    from governance.object_revisions
    where entity_type='profiling.quality_rule_definitions' and entity_id=v_rule_id;
    v_checks := v_checks || jsonb_build_object('governance_object_revision',v_count>=2);
    if v_count<2 then raise exception 'Quality rule revision history was not captured'; end if;

    update governance.dataset_catalog set certification_status='CERTIFIED',certified_at=now() where dataset_id=v_dataset_id;
    insert into profiling.quality_rule_runs(
      rule_definition_id,dataset_version_id,profile_run_id,status,passed,observed_value,threshold,evidence,completed_at
    ) values(v_rule_id,v_version_id,v_profile_id,'FAILED',false,0.2,0.01,jsonb_build_object('synthetic',true),now());

    select certification_status into v_status from governance.dataset_catalog where dataset_id=v_dataset_id;
    v_checks := v_checks || jsonb_build_object('quality_failure_certification_invalidation',v_status='EXPIRED');
    if v_status is distinct from 'EXPIRED' then raise exception 'High-severity quality failure did not invalidate certification'; end if;

    select count(*) into v_count
    from orchestration.event_outbox
    where project_id=v_project_id and event_type='QUALITY_RULE_EVALUATED';
    v_checks := v_checks || jsonb_build_object('quality_rule_outbox',v_count=1);
    if v_count<>1 then raise exception 'QUALITY_RULE_EVALUATED outbox event was not emitted exactly once'; end if;

    insert into governance.workflow_definitions(project_id,workflow_key,name,entity_type,version,steps,enabled)
    values(v_project_id,'synthetic-certification','Synthetic Certification Workflow','DATASET',1,'[{"name":"Steward review"},{"name":"Owner approval"}]'::jsonb,true)
    returning id into v_workflow_id;

    v_instance_id := governance.start_workflow(v_workflow_id,'DATASET',v_dataset_id,null,jsonb_build_object('synthetic',true));
    perform governance.act_workflow(v_instance_id,null,'APPROVE','Synthetic steward workflow transition','{}'::jsonb);
    v_workflow_result := governance.act_workflow(v_instance_id,null,'APPROVE','Synthetic owner workflow transition','{}'::jsonb);
    v_checks := v_checks || jsonb_build_object('workflow_completion',v_workflow_result->>'status'='APPROVED');
    if v_workflow_result->>'status'<>'APPROVED' then raise exception 'Configurable workflow did not complete as APPROVED'; end if;

    select governance.evaluate_data_contract(v_profile_id) into v_contract_result;
    v_checks := v_checks || jsonb_build_object('contract_authority_idempotency',v_contract_result->>'status'='NO_CONTRACT');
    if v_contract_result->>'status'<>'NO_CONTRACT' then
      raise exception 'Non-authoritative contract evaluation was not idempotently fail-closed';
    end if;

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
$$;

comment on function governance.run_synthetic_governance_integration_suite() is
'Self-cleaning cross-module integration suite. Synthetic data-contract coverage is intentionally non-authoritative: it proves direct activation without governed approval fails closed and never fabricates human approval evidence.';

commit;
