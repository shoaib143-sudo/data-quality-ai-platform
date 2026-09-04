create or replace function agent.project_remediation_knowledge_case()
returns trigger language plpgsql security definer set search_path = agent, governance, public as $$
begin
  insert into agent.agent_learning_cases (
    project_id,case_key,source_kind,problem_type,context,recommendation,decision_status,
    outcome_status,effectiveness,confidence,evidence,status,occurred_at,updated_at
  ) values (
    new.project_id,'remediation:' || new.knowledge_key,'GOVERNANCE_REMEDIATION_KNOWLEDGE',new.problem_type,
    jsonb_build_object('dataset_id',new.dataset_id,'issue_id',new.issue_id,'symptom',new.symptom),
    jsonb_build_object('action',new.remediation_action,'reusable_guidance',new.reusable_guidance),'OBSERVED',new.outcome_status,
    case new.outcome_status when 'WORKED' then 1 when 'PARTIAL' then 0.5 when 'FAILED' then 0 else null end,
    new.confidence,jsonb_build_object('source_id',new.id,'before',new.before_evidence,'after',new.after_evidence,'metadata',new.metadata),
    'ACTIVE',new.updated_at,now()
  ) on conflict (project_id,case_key) do update set
    problem_type=excluded.problem_type,context=excluded.context,recommendation=excluded.recommendation,
    outcome_status=excluded.outcome_status,effectiveness=excluded.effectiveness,confidence=excluded.confidence,
    evidence=excluded.evidence,status='ACTIVE',occurred_at=excluded.occurred_at,updated_at=now();
  return new;
end;
$$;
drop trigger if exists trg_project_remediation_knowledge_case on governance.remediation_knowledge;
create trigger trg_project_remediation_knowledge_case after insert or update on governance.remediation_knowledge
for each row execute function agent.project_remediation_knowledge_case();

create or replace function agent.project_profiling_recommendation_case()
returns trigger language plpgsql security definer set search_path = agent, governance, public as $$
begin
  insert into agent.agent_learning_cases (
    project_id,case_key,source_kind,problem_type,context,recommendation,decision_status,
    outcome_status,effectiveness,confidence,evidence,status,occurred_at,updated_at
  ) values (
    new.project_id,'profiling-learning:' || new.id::text,'PROFILING_RECOMMENDATION_LEARNING','PROFILING_RECOMMENDATION',
    jsonb_build_object('source_profile_run_id',new.source_profile_run_id,'workflow_instance_id',new.workflow_instance_id,'finding_ids',new.finding_ids,'rationale',new.rationale),
    jsonb_build_object('action',new.recommendation_action,'priority',new.priority),new.status,new.status,
    case when new.effective is true then 1 when new.effective is false then 0 else null end,
    case when new.status='EFFECTIVE' then 0.95 when new.status='INEFFECTIVE' then 0.9 else 0.6 end,
    jsonb_build_object('source_id',new.id,'remediation_outcome_id',new.remediation_outcome_id,'quality_score_delta',new.quality_score_delta,'high_severity_findings_delta',new.high_severity_findings_delta,'evidence',new.evidence),
    'ACTIVE',coalesce(new.observed_at,new.updated_at,new.created_at),now()
  ) on conflict (project_id,case_key) do update set
    context=excluded.context,recommendation=excluded.recommendation,decision_status=excluded.decision_status,
    outcome_status=excluded.outcome_status,effectiveness=excluded.effectiveness,confidence=excluded.confidence,
    evidence=excluded.evidence,status='ACTIVE',occurred_at=excluded.occurred_at,updated_at=now();
  return new;
end;
$$;
drop trigger if exists trg_project_profiling_recommendation_case on governance.profiling_recommendation_learning;
create trigger trg_project_profiling_recommendation_case after insert or update on governance.profiling_recommendation_learning
for each row execute function agent.project_profiling_recommendation_case();

create or replace function agent.project_dq_recommendation_case()
returns trigger language plpgsql security definer set search_path = agent, governance, public as $$
begin
  insert into agent.agent_learning_cases (
    project_id,agent_definition_id,source_agent_run_id,case_key,source_kind,problem_type,context,recommendation,
    decision_status,outcome_status,effectiveness,confidence,evidence,status,occurred_at,updated_at
  )
  select new.project_id,ar.agent_definition_id,new.source_agent_run_id,'dq-learning:' || new.id::text,
    'DATA_QUALITY_RECOMMENDATION_LEARNING','DATA_QUALITY_RECOMMENDATION',
    jsonb_build_object('workflow_instance_id',new.workflow_instance_id,'quality_rule_run_ids',new.quality_rule_run_ids,'rationale',new.rationale),
    jsonb_build_object('action',new.recommendation_action,'priority',new.priority),new.status,new.status,
    case when new.effective is true then 1 when new.effective is false then 0 else null end,
    case when new.status='VERIFIED' and new.effective is true then 0.95 when new.status='INEFFECTIVE' then 0.9 else 0.6 end,
    jsonb_build_object('source_id',new.id,'remediation_outcome_id',new.remediation_outcome_id,'verification_agent_run_id',new.verification_agent_run_id,'evidence',new.evidence),
    'ACTIVE',new.updated_at,now()
  from agent.agent_runs ar where ar.id=new.source_agent_run_id
  on conflict (project_id,case_key) do update set
    agent_definition_id=excluded.agent_definition_id,source_agent_run_id=excluded.source_agent_run_id,
    context=excluded.context,recommendation=excluded.recommendation,decision_status=excluded.decision_status,
    outcome_status=excluded.outcome_status,effectiveness=excluded.effectiveness,confidence=excluded.confidence,
    evidence=excluded.evidence,status='ACTIVE',occurred_at=excluded.occurred_at,updated_at=now();
  return new;
end;
$$;
drop trigger if exists trg_project_dq_recommendation_case on governance.data_quality_recommendation_learning;
create trigger trg_project_dq_recommendation_case after insert or update on governance.data_quality_recommendation_learning
for each row execute function agent.project_dq_recommendation_case();

insert into agent.agent_learning_cases (
  project_id,case_key,source_kind,problem_type,context,recommendation,decision_status,
  outcome_status,effectiveness,confidence,evidence,status,occurred_at
)
select project_id,'remediation:'||knowledge_key,'GOVERNANCE_REMEDIATION_KNOWLEDGE',problem_type,
  jsonb_build_object('dataset_id',dataset_id,'issue_id',issue_id,'symptom',symptom),
  jsonb_build_object('action',remediation_action,'reusable_guidance',reusable_guidance),'OBSERVED',outcome_status,
  case outcome_status when 'WORKED' then 1 when 'PARTIAL' then 0.5 when 'FAILED' then 0 else null end,
  confidence,jsonb_build_object('source_id',id,'before',before_evidence,'after',after_evidence,'metadata',metadata),'ACTIVE',updated_at
from governance.remediation_knowledge
on conflict (project_id,case_key) do update set
  context=excluded.context,recommendation=excluded.recommendation,outcome_status=excluded.outcome_status,
  effectiveness=excluded.effectiveness,confidence=excluded.confidence,evidence=excluded.evidence,
  status='ACTIVE',occurred_at=excluded.occurred_at,updated_at=now();