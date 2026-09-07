create or replace function governance.current_ai_governance_recommendation_count(p_project_id uuid)
returns bigint
language sql
stable
security definer
set search_path = governance, public
as $$
  select count(distinct (subject_type, subject_id, suggestion_type))
  from governance.ai_governance_suggestions
  where project_id = p_project_id
    and (expires_at is null or expires_at > now());
$$;

revoke all on function governance.current_ai_governance_recommendation_count(uuid) from public, anon, authenticated;
grant execute on function governance.current_ai_governance_recommendation_count(uuid) to service_role;

create or replace function governance.refresh_ai_governance_recommendations(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, governance, profiling, catalog, agent, public
as $$
declare
  v_inserted integer := 0;
  v_enterprise_knowledge integer := 0;
begin
  select count(*)::integer into v_enterprise_knowledge
  from governance.knowledge_documents
  where project_id=p_project_id
    and status='ACTIVE'
    and review_status='APPROVED'
    and source_kind<>'SYNTHETIC';

  with latest_agent as (
    select distinct on (ar.dataset_id)
      ar.id as agent_run_id,
      ar.dataset_id,
      ar.dataset_version_id,
      ar.completed_at
    from agent.agent_runs ar
    join agent.agent_definitions ad on ad.id=ar.agent_definition_id
    where ar.project_id=p_project_id
      and ar.dataset_id is not null
      and ar.dataset_version_id is not null
      and ar.status in ('SUCCEEDED','COMPLETED')
      and ad.agent_key in ('profiling_agent','data_quality_agent')
    order by ar.dataset_id, ar.completed_at desc nulls last, ar.created_at desc
  ), evidence as (
    select
      la.agent_run_id,
      la.dataset_id,
      la.dataset_version_id,
      d.name as dataset_name,
      pr.id as profile_run_id,
      qs.overall_score,
      coalesce(qr.pending_rules,0) as pending_rules,
      coalesce(pf.material_findings,0) as material_findings,
      rp.probability as governance_risk_probability,
      rp.risk_level as governance_risk_level,
      rp.confidence as governance_risk_confidence,
      rp.explanation as governance_risk_explanation
    from latest_agent la
    join catalog.datasets d on d.id=la.dataset_id and d.project_id=p_project_id
    left join lateral (
      select p.id
      from profiling.profile_runs p
      where p.dataset_version_id=la.dataset_version_id and p.status='COMPLETED'
      order by p.completed_at desc nulls last, p.started_at desc
      limit 1
    ) pr on true
    left join lateral (
      select s.overall_score
      from profiling.data_quality_scores s
      where s.profile_run_id=pr.id
      order by s.created_at desc
      limit 1
    ) qs on true
    left join lateral (
      select count(*)::integer as pending_rules
      from profiling.quality_rule_definitions q
      where q.project_id=p_project_id
        and q.dataset_version_id=la.dataset_version_id
        and q.approval_status='PENDING'
        and q.enabled=false
    ) qr on true
    left join lateral (
      select count(*)::integer as material_findings
      from profiling.profile_findings f
      where f.profile_run_id=pr.id
        and f.severity in ('HIGH','CRITICAL')
    ) pf on true
    left join lateral (
      select r.probability,r.risk_level,r.confidence,r.explanation
      from governance.governance_risk_predictions r
      where r.project_id=p_project_id
        and r.dataset_id=la.dataset_id
        and r.prediction_type='GOVERNANCE_RISK_30D'
      order by r.calculated_at desc
      limit 1
    ) rp on true
  ), inserted as (
    insert into governance.ai_governance_suggestions(
      project_id,
      source_agent_run_id,
      source_artifact_id,
      suggestion_type,
      subject_type,
      subject_id,
      target_locator,
      suggestion,
      evidence,
      confidence,
      expires_at,
      content_hash
    )
    select
      p_project_id,
      e.agent_run_id,
      null,
      'POLICY_CONTROL',
      'DATASET',
      e.dataset_id,
      e.dataset_name,
      jsonb_build_object(
        'headline','Review dataset governance evidence and proposed controls',
        'recommended_actions', jsonb_strip_nulls(jsonb_build_array(
          case when e.pending_rules>0 then jsonb_build_object('action','REVIEW_PENDING_QUALITY_CONTROLS','count',e.pending_rules,'requires_human_approval',true) end,
          case when e.material_findings>0 then jsonb_build_object('action','REVIEW_MATERIAL_PROFILE_FINDINGS','count',e.material_findings,'requires_human_judgement',true) end,
          case when coalesce(e.governance_risk_probability,0)>=0.4 then jsonb_build_object('action','REVIEW_GOVERNANCE_RISK','risk_level',e.governance_risk_level,'probability',e.governance_risk_probability) end
        )),
        'authority_boundary','ADVISORY_ONLY',
        'policy_grounded',false,
        'policy_grounding_available',v_enterprise_knowledge>0,
        'policy_grounding_note',case when v_enterprise_knowledge>0 then 'Approved enterprise governance knowledge exists, but this recommendation is generated from dataset evidence only.' else 'No approved non-synthetic governance corpus is available; no policy authority is asserted.' end
      ),
      jsonb_strip_nulls(jsonb_build_object(
        'dataset_version_id',e.dataset_version_id,
        'profile_run_id',e.profile_run_id,
        'overall_quality_score',e.overall_score,
        'pending_quality_rules',e.pending_rules,
        'material_profile_findings',e.material_findings,
        'governance_risk_probability',e.governance_risk_probability,
        'governance_risk_level',e.governance_risk_level,
        'governance_risk_confidence',e.governance_risk_confidence,
        'governance_risk_explanation',e.governance_risk_explanation,
        'enterprise_governance_documents',v_enterprise_knowledge,
        'recommendation_identity_version',2,
        'truth_boundary','Observation and AI recommendation are not governance authority.'
      )),
      case
        when e.governance_risk_confidence is not null then least(0.90::numeric, greatest(0.50::numeric, e.governance_risk_confidence))
        when e.profile_run_id is not null then 0.75::numeric
        else 0.60::numeric
      end,
      now()+interval '30 days',
      md5(concat_ws('|',
        'recommendation-identity-v2',
        e.dataset_id::text,
        e.dataset_version_id::text,
        coalesce(e.profile_run_id::text,''),
        e.pending_rules::text,
        e.material_findings::text,
        case when coalesce(e.overall_score,1)<0.80 then 'QUALITY_REVIEW' else 'QUALITY_OK' end,
        case when coalesce(e.governance_risk_probability,0)>=0.4 then 'RISK_REVIEW' else 'NO_RISK_REVIEW' end,
        coalesce(e.governance_risk_level,''),
        case when v_enterprise_knowledge>0 then 'KNOWLEDGE_READY' else 'KNOWLEDGE_BLOCKED' end
      ))
    from evidence e
    where e.pending_rules>0
       or e.material_findings>0
       or coalesce(e.governance_risk_probability,0)>=0.4
       or coalesce(e.overall_score,1)<0.80
    on conflict (project_id,source_agent_run_id,content_hash) do nothing
    returning id
  )
  select count(*)::integer into v_inserted from inserted;

  return jsonb_build_object(
    'project_id',p_project_id,
    'suggestions_inserted',v_inserted,
    'current_recommendation_count',governance.current_ai_governance_recommendation_count(p_project_id),
    'recommendation_identity_version',2,
    'authority_mode','ADVISORY_ONLY',
    'enterprise_governance_documents',v_enterprise_knowledge,
    'policy_authority_ready',v_enterprise_knowledge>0,
    'knowledge_blocker',case when v_enterprise_knowledge>0 then null else 'APPROVED_ENTERPRISE_GOVERNANCE_CORPUS_REQUIRED' end
  );
end;
$$;

revoke all on function governance.refresh_ai_governance_recommendations(uuid) from public, anon, authenticated;
grant execute on function governance.refresh_ai_governance_recommendations(uuid) to service_role;
