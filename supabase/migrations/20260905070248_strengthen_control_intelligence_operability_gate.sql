create or replace function governance.verify_ai_governance_intelligence(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','governance','profiling','agent','app'
as $function$
declare
  v_activated boolean;
  v_result jsonb;
  v_checks jsonb;
  v_failure_count integer;
  v_partial_count integer;
  v_violation_count bigint;
  v_suggested_count bigint;
  v_pending_count bigint;
  v_approved_count bigint;
  v_trigger_present boolean;
  v_rpc_present boolean;
  v_status text;
  v_classification_rpc boolean;
  v_classification_trigger boolean;
  v_cde_rpc boolean;
  v_cde_trigger boolean;
  v_knowledge_rpc boolean;
  v_knowledge_trigger boolean;
  v_existing_review_rpc_failure boolean;
  v_any_review_failure boolean;
  v_control_tables_ok boolean;
  v_control_rpcs_ok boolean;
  v_control_triggers_ok boolean;
  v_control_browser_dml boolean;
  v_control_lifecycle_violations bigint;
  v_control_stale_evaluation_gaps bigint;
  v_control_proposed bigint;
  v_control_active bigint;
  v_control_evaluations bigint;
  v_control_open_findings bigint;
  v_control_mode text;
begin
  if not exists (select 1 from app.projects where id=p_project_id) then
    raise exception 'Project % was not found',p_project_id;
  end if;

  select exists(select 1 from governance.knowledge_documents where project_id=p_project_id)
    or exists(
      select 1 from agent.agent_runs ar
      join agent.agent_definitions ad on ad.id=ar.agent_definition_id
      where ar.project_id=p_project_id and ar.status='SUCCEEDED'
        and ad.agent_key in ('steward_agent','governance_analyst_agent','architect_agent','investigator_agent','executive_agent','support_agent')
    ) into v_activated;

  if not v_activated then
    return jsonb_build_object('project_id',p_project_id,'status','NOT_ASSESSED','failure_count',0,'partial_or_external_count',0,'checks','{}'::jsonb,'blockers','[]'::jsonb,'reason','AI governance intelligence has not been activated for this project.','verified_at',now());
  end if;

  v_result := governance.verify_ai_governance_intelligence_active(p_project_id);
  v_checks := coalesce(v_result->'checks','{}'::jsonb);
  v_failure_count := coalesce((v_result->>'failure_count')::integer,0);
  v_partial_count := coalesce((v_result->>'partial_or_external_count')::integer,0);

  v_classification_rpc := to_regprocedure('governance.review_dataset_classification(uuid,uuid,uuid,text,text)') is not null;
  v_classification_trigger := exists(select 1 from pg_trigger where tgname='trg_protect_classification_human_review' and not tgisinternal);
  v_cde_rpc := to_regprocedure('governance.review_cde_mapping(uuid,uuid,uuid,text,text)') is not null;
  v_cde_trigger := exists(select 1 from pg_trigger where tgname='trg_protect_cde_human_review' and not tgisinternal);
  v_knowledge_rpc := to_regprocedure('governance.review_governance_knowledge_document(uuid,uuid,uuid,text,text)') is not null;
  v_knowledge_trigger := exists(select 1 from pg_trigger where tgname='trg_protect_knowledge_document_review' and not tgisinternal);
  v_existing_review_rpc_failure := not v_classification_rpc or not v_cde_rpc;
  v_any_review_failure := not v_classification_rpc or not v_classification_trigger or not v_cde_rpc or not v_cde_trigger or not v_knowledge_rpc or not v_knowledge_trigger;

  v_checks := v_checks || jsonb_build_object('human_review_boundary',jsonb_build_object(
    'status',case when not v_any_review_failure then 'PASS' else 'FAIL' end,
    'classification_review_rpc',v_classification_rpc,'classification_protection_trigger',v_classification_trigger,
    'cde_review_rpc',v_cde_rpc,'cde_protection_trigger',v_cde_trigger,
    'knowledge_document_review_rpc',v_knowledge_rpc,'knowledge_document_protection_trigger',v_knowledge_trigger,
    'policy','HUMAN_REVIEW_RPC_AND_PROTECTION_TRIGGER_REQUIRED'));
  if v_any_review_failure and not v_existing_review_rpc_failure then v_failure_count := v_failure_count + 1; end if;

  select count(*),count(*) filter (where approval_status='PENDING'),count(*) filter (where approval_status='APPROVED'),count(*) filter (where enabled=true and approval_status<>'APPROVED')
  into v_suggested_count,v_pending_count,v_approved_count,v_violation_count
  from profiling.quality_rule_definitions where project_id=p_project_id and origin='SUGGESTED';
  select exists(select 1 from pg_trigger where tgname='trg_protect_quality_rule_approval' and not tgisinternal) into v_trigger_present;
  v_rpc_present := to_regprocedure('profiling.review_quality_rule(uuid,uuid,uuid,text,text)') is not null;
  v_checks := v_checks || jsonb_build_object('quality_rule_human_approval',jsonb_build_object(
    'status',case when v_violation_count=0 and v_trigger_present and v_rpc_present then 'PASS' else 'FAIL' end,
    'suggested_rules',v_suggested_count,'pending_rules',v_pending_count,'approved_rules',v_approved_count,
    'enabled_without_approval',v_violation_count,'protection_trigger',v_trigger_present,'review_rpc',v_rpc_present,
    'policy','SUGGESTED_RULES_DISABLED_UNTIL_HUMAN_APPROVAL'));
  if v_violation_count>0 or not v_trigger_present or not v_rpc_present then v_failure_count := v_failure_count + 1; end if;

  v_control_tables_ok := to_regclass('governance.control_definitions') is not null
    and to_regclass('governance.requirement_control_links') is not null
    and to_regclass('governance.control_scope_bindings') is not null
    and to_regclass('governance.control_evidence') is not null
    and to_regclass('governance.control_evaluations') is not null
    and to_regclass('governance.governance_findings') is not null;
  v_control_rpcs_ok := to_regprocedure('governance.propose_governance_control(uuid,uuid,jsonb,jsonb)') is not null
    and to_regprocedure('governance.review_governance_control(uuid,uuid,uuid,text,text)') is not null
    and to_regprocedure('governance.bind_governance_control_scope(uuid,uuid,uuid,jsonb)') is not null
    and to_regprocedure('governance.record_governance_control_evidence(uuid,uuid,uuid,jsonb)') is not null
    and to_regprocedure('governance.evaluate_governance_control(uuid,uuid,uuid,uuid)') is not null
    and to_regprocedure('governance.refresh_governance_control_evidence(uuid,uuid,uuid,uuid)') is not null
    and to_regprocedure('governance.refresh_project_governance_control_intelligence(uuid,uuid)') is not null
    and to_regprocedure('governance.refresh_all_governance_control_intelligence()') is not null;
  v_control_triggers_ok := exists(select 1 from pg_trigger where tgname='trg_protect_governance_control_review' and not tgisinternal)
    and exists(select 1 from pg_trigger where tgname='trg_invalidate_controls_on_requirement_change' and not tgisinternal)
    and exists(select 1 from pg_trigger where tgname='trg_protect_automated_control_evidence_key' and not tgisinternal)
    and exists(select 1 from pg_trigger where tgname='trg_project_control_finding_to_issue' and not tgisinternal)
    and exists(select 1 from pg_trigger where tgname='trg_protect_control_managed_issue' and not tgisinternal);
  select exists(
    select 1 from information_schema.role_table_grants
    where table_schema='governance' and table_name in ('control_definitions','requirement_control_links','control_scope_bindings','control_evidence','control_evaluations','governance_findings')
      and grantee in ('authenticated','anon') and privilege_type in ('INSERT','UPDATE','DELETE')
  ) into v_control_browser_dml;
  select count(*) into v_control_lifecycle_violations
  from governance.control_definitions c
  where c.project_id=p_project_id and c.lifecycle_status='ACTIVE'
    and (c.review_status<>'APPROVED' or c.authority_class='UNVERIFIED');
  v_control_lifecycle_violations := v_control_lifecycle_violations + (
    select count(*) from governance.control_evaluations e
    join governance.control_definitions c on c.id=e.control_id and c.project_id=e.project_id
    where e.project_id=p_project_id and (c.lifecycle_status<>'ACTIVE' or c.review_status<>'APPROVED')
  );

  select count(*) into v_control_stale_evaluation_gaps
  from governance.control_definitions c
  left join governance.control_scope_bindings b
    on b.control_id=c.id and b.project_id=c.project_id and b.status='ACTIVE'
  where c.project_id=p_project_id
    and c.lifecycle_status='ACTIVE'
    and c.review_status='APPROVED'
    and c.evaluation_method='EVIDENCE_ASSERTION'
    and coalesce(c.reviewed_at,c.updated_at) < now() - interval '5 minutes'
    and not exists(
      select 1 from governance.control_evaluations e
      where e.project_id=c.project_id and e.control_id=c.id
        and e.scope_binding_id is not distinct from b.id
        and e.evaluated_at >= coalesce(c.reviewed_at,c.updated_at)
    );

  select count(*) filter(where lifecycle_status='PROPOSED'),count(*) filter(where lifecycle_status='ACTIVE')
    into v_control_proposed,v_control_active from governance.control_definitions where project_id=p_project_id;
  select count(*) into v_control_evaluations from governance.control_evaluations where project_id=p_project_id;
  select count(*) into v_control_open_findings from governance.governance_findings where project_id=p_project_id and status in ('OPEN','ACKNOWLEDGED');
  v_control_mode := case when v_control_active>0 then 'ACTIVE' when v_control_proposed>0 then 'READY_PENDING_AUTHORITY' else 'READY_NO_CONTROLS' end;

  v_checks := v_checks || jsonb_build_object('governance_control_intelligence',jsonb_build_object(
    'status',case when v_control_tables_ok and v_control_rpcs_ok and v_control_triggers_ok and not v_control_browser_dml and v_control_lifecycle_violations=0 and v_control_stale_evaluation_gaps=0 then 'PASS' else 'FAIL' end,
    'mode',v_control_mode,
    'tables_present',v_control_tables_ok,
    'rpc_boundary_present',v_control_rpcs_ok,
    'protection_triggers_present',v_control_triggers_ok,
    'continuous_reconciliation_present',to_regprocedure('governance.refresh_all_governance_control_intelligence()') is not null,
    'automated_evidence_collector_present',to_regprocedure('governance.refresh_governance_control_evidence(uuid,uuid,uuid,uuid)') is not null,
    'control_issue_projection_present',exists(select 1 from pg_trigger where tgname='trg_project_control_finding_to_issue' and not tgisinternal),
    'browser_dml_exposed',v_control_browser_dml,
    'lifecycle_violations',v_control_lifecycle_violations,
    'stale_evaluation_gaps',v_control_stale_evaluation_gaps,
    'reconciliation_slo_minutes',5,
    'proposed_controls',v_control_proposed,
    'active_controls',v_control_active,
    'evaluations',v_control_evaluations,
    'open_findings',v_control_open_findings,
    'policy','PROPOSE_FROM_REQUIREMENTS_HUMAN_APPROVE_BEFORE_ACTIVE_CONTINUOUS_AUTHORITATIVE_EVIDENCE_EVALUATION'));
  if not v_control_tables_ok or not v_control_rpcs_ok or not v_control_triggers_ok or v_control_browser_dml or v_control_lifecycle_violations>0 or v_control_stale_evaluation_gaps>0 then
    v_failure_count := v_failure_count + 1;
  end if;

  if v_failure_count>0 then v_status:='FAILED'; elsif v_partial_count>0 then v_status:='PARTIAL'; else v_status:='PASSED'; end if;
  return v_result || jsonb_build_object('status',v_status,'failure_count',v_failure_count,'checks',v_checks,'verified_at',now());
end;
$function$;
