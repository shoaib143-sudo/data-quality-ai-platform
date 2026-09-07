create or replace function governance.governance_knowledge_readiness(p_project_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = governance, public
as $$
  select jsonb_build_object(
    'project_id', p_project_id,
    'active_documents', count(*) filter (where status='ACTIVE'),
    'approved_non_synthetic_documents', count(*) filter (
      where status='ACTIVE' and review_status='APPROVED' and source_kind<>'SYNTHETIC'
    ),
    'synthetic_bootstrap_documents', count(*) filter (
      where status='ACTIVE' and source_kind='SYNTHETIC'
    ),
    'policy_authority_ready', count(*) filter (
      where status='ACTIVE' and review_status='APPROVED' and source_kind<>'SYNTHETIC'
    ) > 0,
    'blocker_code', case when count(*) filter (
      where status='ACTIVE' and review_status='APPROVED' and source_kind<>'SYNTHETIC'
    ) > 0 then null else 'APPROVED_ENTERPRISE_GOVERNANCE_CORPUS_REQUIRED' end
  )
  from governance.knowledge_documents
  where project_id=p_project_id;
$$;

revoke all on function governance.governance_knowledge_readiness(uuid) from public, anon, authenticated;
grant execute on function governance.governance_knowledge_readiness(uuid) to service_role;

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
        'truth_boundary','Observation and AI recommendation are not governance authority.'
      )),
      case
        when e.governance_risk_confidence is not null then least(0.90::numeric, greatest(0.50::numeric, e.governance_risk_confidence))
        when e.profile_run_id is not null then 0.75::numeric
        else 0.60::numeric
      end,
      now()+interval '30 days',
      md5(concat_ws('|',
        e.dataset_id::text,
        e.dataset_version_id::text,
        coalesce(e.profile_run_id::text,''),
        e.pending_rules::text,
        e.material_findings::text,
        coalesce(e.overall_score::text,''),
        coalesce(e.governance_risk_probability::text,''),
        coalesce(e.governance_risk_level,'')
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
    'authority_mode','ADVISORY_ONLY',
    'enterprise_governance_documents',v_enterprise_knowledge,
    'policy_authority_ready',v_enterprise_knowledge>0,
    'knowledge_blocker',case when v_enterprise_knowledge>0 then null else 'APPROVED_ENTERPRISE_GOVERNANCE_CORPUS_REQUIRED' end
  );
end;
$$;

revoke all on function governance.refresh_ai_governance_recommendations(uuid) from public, anon, authenticated;
grant execute on function governance.refresh_ai_governance_recommendations(uuid) to service_role;

create or replace function governance.refresh_ai_governance_intelligence()
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'governance', 'app'
as $$
declare
  p record;
  v_projects integer:=0;
  v_cert_datasets integer:=0;
  v_suggestions integer:=0;
  v_cert jsonb;
  v_suggestion_result jsonb;
begin
  for p in select id from app.projects loop
    v_cert:=governance.refresh_certification_readiness(p.id);
    perform governance.refresh_governance_roi(p.id);
    v_suggestion_result:=governance.refresh_ai_governance_recommendations(p.id);
    v_projects:=v_projects+1;
    v_cert_datasets:=v_cert_datasets+coalesce((v_cert->>'datasets_assessed')::integer,0);
    v_suggestions:=v_suggestions+coalesce((v_suggestion_result->>'suggestions_inserted')::integer,0);
  end loop;
  return jsonb_build_object(
    'projects_refreshed',v_projects,
    'certification_datasets_assessed',v_cert_datasets,
    'governance_suggestions_inserted',v_suggestions
  );
end;
$$;

create or replace function governance.generate_ai_capability_matrix(p_project_id uuid)
returns table(capability_id int, capability text, evidence_domain text, status text, evidence_count bigint, evidence_source text)
language sql
stable
security invoker
set search_path = governance, profiling, catalog, agent, public
as $$
with capabilities(capability_id, capability, evidence_domain) as (
  values
  (1,'Automated data profiling','profiling'),(2,'Column classification','classification'),(3,'Sensitive data detection','classification'),(4,'Critical data element identification','cde'),(5,'Data quality rule suggestion','quality_rules'),(6,'Automated rule generation','quality_rules'),(7,'Data quality scoring','quality_score'),(8,'Anomaly detection','observability'),(9,'Drift detection','comparison'),(10,'Schema drift detection','observability'),(11,'Distribution drift','comparison'),(12,'Duplicate detection','profiling'),(13,'Missing data analysis','profiling'),(14,'Outlier detection','profiling'),(15,'Data freshness monitoring','observability'),(16,'Data timeliness prediction','risk_prediction'),(17,'Data completeness prediction','risk_prediction'),(18,'Root cause analysis','investigation'),(19,'Cross dataset correlation','investigation'),(20,'Cross system reconciliation','investigation'),(21,'Referential integrity investigation','quality_rules'),(22,'Business rule violation detection','quality_rules'),(23,'Policy to rule translation','knowledge'),(24,'Standards interpretation','knowledge'),(25,'Regulatory requirement mapping','knowledge'),(26,'Data classification','classification'),(27,'Business glossary generation','glossary'),(28,'Data asset descriptions','catalog'),(29,'Metadata enrichment','catalog'),(30,'Dataset ownership inference','accountability'),(31,'Data lineage interpretation','field_lineage'),(32,'Impact analysis','field_lineage'),(33,'Incident summarisation','investigation'),(34,'Incident classification','investigation'),(35,'Incident prioritisation','investigation'),(36,'Risk scoring','risk_prediction'),(37,'Predictive risk monitoring','risk_prediction'),(38,'Quality trend prediction','risk_prediction'),(39,'Pipeline failure prediction','risk_prediction'),(40,'SLA risk prediction','risk_prediction'),(41,'Remediation recommendation','remediation'),(42,'Remediation planning','remediation'),(43,'Safe automated remediation','autonomy'),(44,'Human approval workflow','workflow'),(45,'Verification after remediation','remediation_outcome'),(46,'Rollback recommendation','autonomy'),(47,'Agent based investigation','agent'),(48,'Agent based quality analyst','agent'),(49,'Agent based data steward','agent'),(50,'Agent based incident investigator','agent'),(51,'Agent based governance analyst','knowledge'),(52,'Agent based data architect','field_lineage'),(53,'Agent based executive analyst','agent'),(54,'Natural language data investigation','agent'),(55,'Natural language rule creation','quality_rules'),(56,'Natural language root cause explanation','investigation'),(57,'AI generated profiling reports','profiling'),(58,'AI generated data quality narratives','profiling'),(59,'AI generated governance recommendations','governance_recommendations'),(60,'AI knowledge retrieval','semantic'),(61,'Policy aware AI','knowledge'),(62,'Risk aware autonomy','autonomy'),(63,'AI decision evidence','audit'),(64,'AI action audit','audit'),(65,'AI confidence management','agent_evaluation'),(66,'Human feedback learning','learning'),(67,'AI recommendation evaluation','agent_evaluation'),(68,'AI agent performance monitoring','agent_logs'),(69,'Agent kill / emergency control','agent_lifecycle'),(70,'Agent debugging and log extraction','agent_logs'),(71,'Autonomous data quality monitoring','observability'),(72,'Data estate health index','scorecard'),(73,'Data risk heatmap','risk_prediction'),(74,'Data estate recommendations','roi'),(75,'Continuous governance improvement','learning')
), e as (
  select
    (select count(*) from profiling.profile_runs pr join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id where d.project_id=p_project_id and pr.status='COMPLETED') as profiling,
    (select count(*) from governance.dataset_classifications where project_id=p_project_id) as classification,
    (select count(*) from governance.cde_mappings where project_id=p_project_id) as cde,
    (select count(*) from profiling.quality_rule_definitions where project_id=p_project_id) as quality_rules,
    (select count(*) from profiling.data_quality_scores s join profiling.profile_runs pr on pr.id=s.profile_run_id join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id where d.project_id=p_project_id) as quality_score,
    (select count(*) from profiling.observability_alerts where project_id=p_project_id) as observability,
    (select count(*) from profiling.profile_comparisons pc join profiling.profile_runs pr on pr.id=pc.current_profile_run_id join catalog.dataset_versions dv on dv.id=pr.dataset_version_id join catalog.datasets d on d.id=dv.dataset_id where d.project_id=p_project_id) as comparison,
    (select count(*) from governance.data_quality_investigations where project_id=p_project_id) as investigation,
    (select count(*) from governance.governance_risk_predictions where project_id=p_project_id) as risk_prediction,
    (select count(*) from governance.knowledge_documents where project_id=p_project_id) as knowledge_any,
    (select count(*) from governance.knowledge_documents where project_id=p_project_id and source_kind<>'SYNTHETIC' and review_status='APPROVED') as knowledge_enterprise,
    (select count(*) from governance.ai_governance_suggestions where project_id=p_project_id) as governance_recommendations,
    (select count(*) from governance.glossary_terms where project_id=p_project_id) as glossary,
    (select count(*) from catalog.datasets where project_id=p_project_id) as catalog,
    (select count(*) from governance.accountability_assignments where project_id=p_project_id) as accountability,
    (select count(*) from governance.lineage_column_mappings where project_id=p_project_id and source_column is not null and target_column is not null) as field_lineage,
    (select count(*) from governance.remediation_knowledge where project_id=p_project_id) as remediation,
    ((select count(*) from governance.profiling_remediation_outcomes where project_id=p_project_id)+(select count(*) from governance.data_quality_remediation_outcomes where project_id=p_project_id)) as remediation_outcome,
    (select count(*) from governance.autonomy_actions where project_id=p_project_id) as autonomy,
    (select count(*) from governance.workflow_instances where project_id=p_project_id) as workflow,
    (select count(*) from agent.agent_runs where project_id=p_project_id and status in ('COMPLETED','SUCCEEDED')) as agent,
    (select count(*) from governance.semantic_embeddings where project_id=p_project_id) as semantic,
    (select count(*) from governance.audit_events where project_id=p_project_id) as audit,
    (select count(*) from agent.agent_evaluations where project_id=p_project_id) as agent_evaluation,
    (select count(*) from agent.agent_learning_cases where project_id=p_project_id) as learning,
    (select count(*) from agent.agent_run_logs l join agent.agent_runs r on r.id=l.agent_run_id where r.project_id=p_project_id) as agent_logs,
    (select count(*) from agent.agent_runs where project_id=p_project_id and (status='CANCELLED' or cancel_requested_at is not null)) as agent_lifecycle,
    (select count(*) from governance.project_scorecard_snapshots where project_id=p_project_id) as scorecard,
    (select count(*) from governance.governance_roi_snapshots where project_id=p_project_id) as roi
), resolved as (
  select c.*,
    case c.evidence_domain when 'profiling' then e.profiling when 'classification' then e.classification when 'cde' then e.cde when 'quality_rules' then e.quality_rules when 'quality_score' then e.quality_score when 'observability' then e.observability when 'comparison' then e.comparison when 'investigation' then e.investigation when 'risk_prediction' then e.risk_prediction when 'knowledge' then e.knowledge_any when 'governance_recommendations' then e.governance_recommendations when 'glossary' then e.glossary when 'catalog' then e.catalog when 'accountability' then e.accountability when 'field_lineage' then e.field_lineage when 'remediation' then e.remediation when 'remediation_outcome' then e.remediation_outcome when 'autonomy' then e.autonomy when 'workflow' then e.workflow when 'agent' then e.agent when 'semantic' then e.semantic when 'audit' then e.audit when 'agent_evaluation' then e.agent_evaluation when 'learning' then e.learning when 'agent_logs' then e.agent_logs when 'agent_lifecycle' then e.agent_lifecycle when 'scorecard' then e.scorecard when 'roi' then e.roi else 0 end as evidence_count,
    e.knowledge_enterprise
  from capabilities c cross join e
)
select capability_id, capability, evidence_domain,
  case when evidence_domain='field_lineage' and evidence_count=0 then 'DATA_PENDING' when evidence_domain='knowledge' and knowledge_enterprise=0 and evidence_count>0 then 'BOOTSTRAP_ONLY' when evidence_count>0 then 'EVIDENCED' else 'NOT_EVIDENCED' end as status,
  evidence_count,
  case evidence_domain when 'profiling' then 'profiling.profile_runs' when 'classification' then 'governance.dataset_classifications' when 'cde' then 'governance.cde_mappings' when 'quality_rules' then 'profiling.quality_rule_definitions' when 'quality_score' then 'profiling.data_quality_scores' when 'observability' then 'profiling.observability_alerts' when 'comparison' then 'profiling.profile_comparisons' when 'investigation' then 'governance.data_quality_investigations' when 'risk_prediction' then 'governance.governance_risk_predictions' when 'knowledge' then 'governance.knowledge_documents' when 'governance_recommendations' then 'governance.ai_governance_suggestions' when 'glossary' then 'governance.glossary_terms' when 'catalog' then 'catalog.datasets' when 'accountability' then 'governance.accountability_assignments' when 'field_lineage' then 'governance.lineage_column_mappings' when 'remediation' then 'governance.remediation_knowledge' when 'remediation_outcome' then 'governance.*_remediation_outcomes' when 'autonomy' then 'governance.autonomy_actions' when 'workflow' then 'governance.workflow_instances' when 'agent' then 'agent.agent_runs' when 'semantic' then 'governance.semantic_embeddings' when 'audit' then 'governance.audit_events' when 'agent_evaluation' then 'agent.agent_evaluations' when 'learning' then 'agent.agent_learning_cases' when 'agent_logs' then 'agent.agent_run_logs' when 'agent_lifecycle' then 'agent.agent_runs' when 'scorecard' then 'governance.project_scorecard_snapshots' when 'roi' then 'governance.governance_roi_snapshots' else 'none' end as evidence_source
from resolved order by capability_id;
$$;

revoke all on function governance.generate_ai_capability_matrix(uuid) from public, anon, authenticated;
grant execute on function governance.generate_ai_capability_matrix(uuid) to service_role;
