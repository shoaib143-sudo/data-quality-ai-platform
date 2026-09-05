create or replace function governance.verify_ai_governance_intelligence(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog','governance','profiling','agent','app'
as $$
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
begin
  if not exists (select 1 from app.projects where id=p_project_id) then
    raise exception 'Project % was not found',p_project_id;
  end if;

  select
    exists(select 1 from governance.knowledge_documents where project_id=p_project_id)
    or exists(
      select 1
      from agent.agent_runs ar
      join agent.agent_definitions ad on ad.id=ar.agent_definition_id
      where ar.project_id=p_project_id
        and ar.status='SUCCEEDED'
        and ad.agent_key in (
          'steward_agent','governance_analyst_agent','architect_agent',
          'investigator_agent','executive_agent','support_agent'
        )
    )
  into v_activated;

  if not v_activated then
    return jsonb_build_object(
      'project_id',p_project_id,
      'status','NOT_ASSESSED',
      'failure_count',0,
      'partial_or_external_count',0,
      'checks','{}'::jsonb,
      'blockers','[]'::jsonb,
      'reason','AI governance intelligence has not been activated for this project.',
      'verified_at',now()
    );
  end if;

  v_result := governance.verify_ai_governance_intelligence_active(p_project_id);
  v_checks := coalesce(v_result->'checks','{}'::jsonb);
  v_failure_count := coalesce((v_result->>'failure_count')::integer,0);
  v_partial_count := coalesce((v_result->>'partial_or_external_count')::integer,0);

  select count(*),
         count(*) filter (where approval_status='PENDING'),
         count(*) filter (where approval_status='APPROVED'),
         count(*) filter (where enabled=true and approval_status<>'APPROVED')
  into v_suggested_count,v_pending_count,v_approved_count,v_violation_count
  from profiling.quality_rule_definitions
  where project_id=p_project_id and origin='SUGGESTED';

  select exists(
    select 1 from pg_trigger
    where tgname='trg_protect_quality_rule_approval' and not tgisinternal
  ) into v_trigger_present;
  v_rpc_present := to_regprocedure('profiling.review_quality_rule(uuid,uuid,uuid,text,text)') is not null;

  v_checks := v_checks || jsonb_build_object(
    'quality_rule_human_approval',
    jsonb_build_object(
      'status',case when v_violation_count=0 and v_trigger_present and v_rpc_present then 'PASS' else 'FAIL' end,
      'suggested_rules',v_suggested_count,
      'pending_rules',v_pending_count,
      'approved_rules',v_approved_count,
      'enabled_without_approval',v_violation_count,
      'protection_trigger',v_trigger_present,
      'review_rpc',v_rpc_present,
      'policy','SUGGESTED_RULES_DISABLED_UNTIL_HUMAN_APPROVAL'
    )
  );

  if v_violation_count>0 or not v_trigger_present or not v_rpc_present then
    v_failure_count := v_failure_count + 1;
  end if;

  if v_failure_count>0 then v_status:='FAILED';
  elsif v_partial_count>0 then v_status:='PARTIAL';
  else v_status:='PASSED'; end if;

  return v_result || jsonb_build_object(
    'status',v_status,
    'failure_count',v_failure_count,
    'checks',v_checks,
    'verified_at',now()
  );
end;
$$;

revoke all on function governance.verify_ai_governance_intelligence(uuid) from public, anon, authenticated;
grant execute on function governance.verify_ai_governance_intelligence(uuid) to service_role;
