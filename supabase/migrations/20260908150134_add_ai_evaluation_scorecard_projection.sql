create or replace function governance.ai_evaluation_scorecard(
  p_project_id uuid,
  p_ai_system_version_id uuid default null,
  p_evaluation_type text default null,
  p_capability text default null
)
returns table (
  evaluation_type text,
  capability text,
  metric_name text,
  sample_count bigint,
  scored_count bigint,
  pass_count bigint,
  fail_count bigint,
  average_score numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    r.evaluation_type,
    r.capability,
    r.metric_name,
    count(*) as sample_count,
    count(r.score) as scored_count,
    count(*) filter (where r.pass is true) as pass_count,
    count(*) filter (where r.pass is false) as fail_count,
    avg(r.score)::numeric as average_score
  from governance.ai_evaluation_results r
  where r.project_id = p_project_id
    and (p_ai_system_version_id is null or r.ai_system_version_id = p_ai_system_version_id)
    and (p_evaluation_type is null or r.evaluation_type = p_evaluation_type)
    and (p_capability is null or r.capability = p_capability)
  group by r.evaluation_type, r.capability, r.metric_name
  order by r.evaluation_type, r.capability nulls first, r.metric_name;
$$;

revoke all on function governance.ai_evaluation_scorecard(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function governance.ai_evaluation_scorecard(uuid, uuid, text, text) to service_role;

comment on function governance.ai_evaluation_scorecard(uuid, uuid, text, text) is
  'Read-only ADR-006 automated evaluation projection. It does not create governed assessments, approve model versions, or alter routing authority.';
