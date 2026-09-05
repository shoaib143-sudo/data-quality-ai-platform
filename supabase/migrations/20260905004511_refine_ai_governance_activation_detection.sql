create or replace function governance.verify_ai_governance_intelligence(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=pg_catalog,governance,agent,app
as $$
declare
  v_activated boolean;
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

  return governance.verify_ai_governance_intelligence_active(p_project_id);
end;
$$;

revoke all on function governance.verify_ai_governance_intelligence(uuid) from public,anon,authenticated;
grant execute on function governance.verify_ai_governance_intelligence(uuid) to service_role;
comment on function governance.verify_ai_governance_intelligence(uuid) is
  'Project-level AI Governance Intelligence due diligence gate. Activation requires governance knowledge or a successful governance specialist agent run; profiling/DQ activity alone remains NOT_ASSESSED.';
