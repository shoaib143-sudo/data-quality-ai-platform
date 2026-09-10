-- V5 authority hardening: reusable learning must originate from canonical governed outcomes.
-- Legacy verified learning cases remain historical evidence but are not reusable memory unless
-- they were projected from governance.governed_action_outcomes with source-agent provenance.

create or replace function agent.search_learning_cases(
  p_project_id uuid,
  p_query text,
  p_limit integer default 10
)
returns table(
  id uuid,
  case_key text,
  source_kind text,
  problem_type text,
  recommendation jsonb,
  outcome_status text,
  effectiveness numeric,
  confidence numeric,
  evidence jsonb,
  relevance numeric
)
language sql
stable
set search_path = agent, public
as $$
  with q as (select lower(trim(coalesce(p_query,''))) value)
  select lc.id,lc.case_key,lc.source_kind,lc.problem_type,lc.recommendation,lc.outcome_status,
         lc.effectiveness,lc.confidence,lc.evidence,
         (
           case when lower(lc.problem_type)=q.value then 1.0 else 0 end +
           case when lower(lc.problem_type) like '%'||q.value||'%' then 0.7 else 0 end +
           case when lower(lc.context::text) like '%'||q.value||'%' then 0.4 else 0 end +
           case when lower(lc.recommendation::text) like '%'||q.value||'%' then 0.35 else 0 end +
           case when lower(lc.evidence::text) like '%'||q.value||'%' then 0.2 else 0 end
         )::numeric relevance
  from agent.agent_learning_cases lc cross join q
  where lc.project_id=p_project_id
    and lc.status='ACTIVE'
    and lc.decision_status='VERIFIED'
    and lc.outcome_status='VERIFIED'
    and lc.source_agent_run_id is not null
    and lc.source_kind='GOVERNED_ACTION_OUTCOME'
    and nullif(trim(lc.evidence->>'governed_action_outcome_id'),'') is not null
    and q.value<>''
    and (
      lower(lc.problem_type) like '%'||q.value||'%' or
      lower(lc.context::text) like '%'||q.value||'%' or
      lower(lc.recommendation::text) like '%'||q.value||'%' or
      lower(lc.evidence::text) like '%'||q.value||'%'
    )
  order by relevance desc,coalesce(lc.effectiveness,-1) desc,lc.updated_at desc
  limit greatest(1,least(coalesce(p_limit,10),50));
$$;

comment on function agent.search_learning_cases(uuid,text,integer) is
  'Returns reusable learning only from ACTIVE verified governed-action outcomes with source-agent provenance.';