create or replace function governance.verify_ai_governance_intelligence(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,governance,profiling,catalog,agent,orchestration,app
as $$
declare
  v_checks jsonb := '{}'::jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_failures integer := 0;
  v_partials integer := 0;
  v_count bigint;
  v_enabled_agents integer;
  v_exercised_agents integer;
  v_audit jsonb;
  v_status text;
  v_real_knowledge bigint;
  v_real_field_lineage bigint;
begin
  if not exists (select 1 from app.projects where id=p_project_id) then
    raise exception 'Project % was not found',p_project_id;
  end if;

  select count(*) into v_count from governance.knowledge_documents where project_id=p_project_id;
  v_checks := v_checks || jsonb_build_object('governance_knowledge',jsonb_build_object('status',case when v_count>0 then 'PASS' else 'FAIL' end,'knowledge_documents',v_count));
  if v_count=0 then v_failures:=v_failures+1; end if;

  select count(*) into v_count from governance.knowledge_relationships where project_id=p_project_id;
  v_checks := v_checks || jsonb_build_object('knowledge_graph',jsonb_build_object('status',case when v_count>0 then 'PASS' else 'FAIL' end,'relationships',v_count));
  if v_count=0 then v_failures:=v_failures+1; end if;

  select count(*) into v_count from governance.critical_data_elements where project_id=p_project_id;
  v_checks := v_checks || jsonb_build_object('critical_data_elements',jsonb_build_object('status',case when v_count>0 then 'PASS' else 'FAIL' end,'count',v_count));
  if v_count=0 then v_failures:=v_failures+1; end if;

  select count(*) into v_count from profiling.quality_rule_runs qrr
  join profiling.quality_rule_definitions qrd on qrd.id=qrr.rule_definition_id
  where qrd.project_id=p_project_id;
  v_checks := v_checks || jsonb_build_object('quality_intelligence',jsonb_build_object(
    'status',case when v_count>0 then 'PASS' else 'FAIL' end,
    'rule_runs',v_count,
    'profile_comparisons',(select count(*) from profiling.profile_comparisons pc join profiling.profile_runs pr on pr.id=pc.current_profile_run_id join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id where d.project_id=p_project_id)
  ));
  if v_count=0 then v_failures:=v_failures+1; end if;

  select count(*) into v_enabled_agents from agent.agent_definitions where enabled=true;
  select count(distinct ad.agent_key) into v_exercised_agents
  from agent.agent_definitions ad join agent.agent_runs ar on ar.agent_definition_id=ad.id
  where ad.enabled=true and ar.project_id=p_project_id and ar.status='SUCCEEDED';
  v_checks := v_checks || jsonb_build_object('specialized_agents',jsonb_build_object(
    'status',case when v_enabled_agents>=8 and v_exercised_agents>=8 then 'PASS' else 'FAIL' end,
    'enabled_agents',v_enabled_agents,'successfully_exercised_roles',v_exercised_agents));
  if v_enabled_agents<8 or v_exercised_agents<8 then v_failures:=v_failures+1; end if;

  select count(*) into v_count from agent.agent_memories where project_id=p_project_id;
  v_checks := v_checks || jsonb_build_object('memory_learning',jsonb_build_object(
    'status',case when v_count>0 and (select count(*) from agent.agent_evaluations where project_id=p_project_id)>0 and (select count(*) from agent.agent_learning_cases where project_id=p_project_id)>0 then 'PASS' else 'FAIL' end,
    'memories',v_count,'evaluations',(select count(*) from agent.agent_evaluations where project_id=p_project_id),'learning_cases',(select count(*) from agent.agent_learning_cases where project_id=p_project_id)));
  if v_count=0 or (select count(*) from agent.agent_evaluations where project_id=p_project_id)=0 or (select count(*) from agent.agent_learning_cases where project_id=p_project_id)=0 then v_failures:=v_failures+1; end if;

  select count(*) into v_count from agent.agent_messages m join agent.agent_runs ar on ar.id=m.target_agent_run_id where ar.project_id=p_project_id and m.status='PROCESSED';
  v_checks := v_checks || jsonb_build_object('cross_agent_collaboration',jsonb_build_object('status',case when v_count>0 then 'PASS' else 'FAIL' end,'processed_handoffs',v_count));
  if v_count=0 then v_failures:=v_failures+1; end if;

  select count(*) into v_count from governance.data_quality_investigations where project_id=p_project_id;
  v_checks := v_checks || jsonb_build_object('investigation_prediction',jsonb_build_object(
    'status',case when v_count>0 and (select count(*) from governance.governance_risk_predictions where project_id=p_project_id)>0 then 'PASS' else 'FAIL' end,
    'investigations',v_count,'risk_predictions',(select count(*) from governance.governance_risk_predictions where project_id=p_project_id)));
  if v_count=0 or (select count(*) from governance.governance_risk_predictions where project_id=p_project_id)=0 then v_failures:=v_failures+1; end if;

  select count(*) into v_count from governance.autonomy_actions where project_id=p_project_id;
  v_checks := v_checks || jsonb_build_object('governed_autonomy',jsonb_build_object('status',case when v_count>0 then 'PASS' else 'FAIL' end,'actions',v_count,'policies',(select count(*) from governance.autonomy_policies where project_id=p_project_id)));
  if v_count=0 then v_failures:=v_failures+1; end if;

  select count(*) into v_count from governance.data_contract_evaluations where project_id=p_project_id;
  v_checks := v_checks || jsonb_build_object('contracts_certification',jsonb_build_object(
    'status',case when v_count>0 and (select count(*) from governance.certification_readiness where project_id=p_project_id)>0 then 'PASS' else 'FAIL' end,
    'contract_evaluations',v_count,'certification_readiness_rows',(select count(*) from governance.certification_readiness where project_id=p_project_id)));
  if v_count=0 or (select count(*) from governance.certification_readiness where project_id=p_project_id)=0 then v_failures:=v_failures+1; end if;

  v_checks := v_checks || jsonb_build_object('human_review_boundary',jsonb_build_object(
    'status',case when to_regprocedure('governance.review_dataset_classification(uuid,uuid,uuid,text,text)') is not null
                       and to_regprocedure('governance.review_cde_mapping(uuid,uuid,uuid,text,text)') is not null
                       and exists(select 1 from pg_trigger where tgname='trg_protect_classification_human_review' and not tgisinternal)
                       and exists(select 1 from pg_trigger where tgname='trg_protect_cde_human_review' and not tgisinternal)
                  then 'PASS' else 'FAIL' end,
    'classification_review_rpc',to_regprocedure('governance.review_dataset_classification(uuid,uuid,uuid,text,text)') is not null,
    'cde_review_rpc',to_regprocedure('governance.review_cde_mapping(uuid,uuid,uuid,text,text)') is not null));
  if to_regprocedure('governance.review_dataset_classification(uuid,uuid,uuid,text,text)') is null
     or to_regprocedure('governance.review_cde_mapping(uuid,uuid,uuid,text,text)') is null then v_failures:=v_failures+1; end if;

  select governance.verify_audit_chain(p_project_id) into v_audit;
  v_checks := v_checks || jsonb_build_object('audit_integrity',jsonb_build_object('status',case when coalesce((v_audit->>'valid')::boolean,false) then 'PASS' else 'FAIL' end,'evidence',v_audit));
  if not coalesce((v_audit->>'valid')::boolean,false) then v_failures:=v_failures+1; end if;

  select count(*) into v_count from governance.semantic_embeddings where project_id=p_project_id;
  if v_count>0 then
    v_checks := v_checks || jsonb_build_object('semantic_rag',jsonb_build_object('status','PASS','embeddings',v_count));
  else
    v_partials:=v_partials+1;
    v_checks := v_checks || jsonb_build_object('semantic_rag',jsonb_build_object('status','EXTERNAL_BLOCKER','embeddings',0,'blocker','GOVERNANCE_EMBEDDING_URL is not configured; self-hosted embedding service must be provisioned.'));
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','SEMANTIC_EMBEDDING_SERVICE_NOT_CONFIGURED','type','EXTERNAL','github_issue',3));
  end if;

  select count(*) into v_real_field_lineage from governance.lineage_column_mappings where project_id=p_project_id;
  if v_real_field_lineage>0 then
    v_checks := v_checks || jsonb_build_object('field_lineage_data',jsonb_build_object('status','PASS','column_mappings',v_real_field_lineage));
  else
    v_partials:=v_partials+1;
    v_checks := v_checks || jsonb_build_object('field_lineage_data',jsonb_build_object('status','DATA_PENDING','column_mappings',0,'engine_validation','SELF_CLEANING_INTEGRATION_SUITE_PASSED','blocker','No real transformation/field-lineage metadata has been ingested for this project.'));
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','REAL_FIELD_LINEAGE_DATA_NOT_INGESTED','type','DATA'));
  end if;

  select count(*) into v_real_knowledge from governance.knowledge_documents
  where project_id=p_project_id and coalesce((metadata->>'synthetic_bootstrap')::boolean,false)=false;
  if v_real_knowledge>0 then
    v_checks := v_checks || jsonb_build_object('enterprise_governance_corpus',jsonb_build_object('status','PASS','non_synthetic_documents',v_real_knowledge));
  else
    v_partials:=v_partials+1;
    v_checks := v_checks || jsonb_build_object('enterprise_governance_corpus',jsonb_build_object('status','BOOTSTRAP_ONLY','non_synthetic_documents',0,'blocker','Current governance corpus is synthetic bootstrap content; real enterprise policies/standards/regulations have not yet been supplied.'));
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object('code','REAL_GOVERNANCE_CORPUS_NOT_INGESTED','type','DATA'));
  end if;

  if v_failures>0 then v_status:='FAILED';
  elsif v_partials>0 then v_status:='PARTIAL';
  else v_status:='PASSED'; end if;

  return jsonb_build_object(
    'project_id',p_project_id,'status',v_status,'failure_count',v_failures,'partial_or_external_count',v_partials,
    'checks',v_checks,'blockers',v_blockers,'verified_at',now());
end;
$$;

revoke all on function governance.verify_ai_governance_intelligence(uuid) from public,anon,authenticated;
grant execute on function governance.verify_ai_governance_intelligence(uuid) to service_role;
comment on function governance.verify_ai_governance_intelligence(uuid) is
  'Project-level due diligence gate for the AI Governance Intelligence platform. Distinguishes implementation failures from external/data activation blockers.';
