alter table governance.ai_routing_policy_versions
  add column if not exists evaluation_type text,
  add column if not exists evaluation_metric_name text,
  add column if not exists evaluation_max_age_seconds integer;

alter table governance.ai_routing_policy_versions
  drop constraint if exists ai_routing_policy_versions_evaluation_signal_check;

alter table governance.ai_routing_policy_versions
  add constraint ai_routing_policy_versions_evaluation_signal_check check (
    (evaluation_type is null and evaluation_metric_name is null and evaluation_max_age_seconds is null)
    or (
      nullif(btrim(evaluation_type), '') is not null
      and nullif(btrim(evaluation_metric_name), '') is not null
      and (evaluation_max_age_seconds is null or evaluation_max_age_seconds > 0)
    )
  );

comment on column governance.ai_routing_policy_versions.evaluation_type is
  'Governed canonical evaluation type used as a routing selection signal. NULL disables evidence ranking.';
comment on column governance.ai_routing_policy_versions.evaluation_metric_name is
  'Governed canonical metric used for model ranking. No cross-metric composite is permitted.';
comment on column governance.ai_routing_policy_versions.evaluation_max_age_seconds is
  'Optional maximum age for canonical evaluation evidence used in routing. Stale evidence falls back deterministically.';

-- The existing thresholds qualify a configured routing signal only. They are not
-- model authorization controls. Policy allow lists and registry lifecycle state
-- remain authoritative for eligibility.

drop function if exists governance.ai_evaluation_scorecard(uuid, uuid, text, text);

create function governance.ai_evaluation_scorecard(
  p_project_id uuid,
  p_ai_system_version_id uuid default null,
  p_evaluation_type text default null,
  p_capability text default null
)
returns table(
  evaluation_type text,
  capability text,
  metric_name text,
  sample_count bigint,
  scored_count bigint,
  pass_count bigint,
  fail_count bigint,
  average_score numeric,
  evidence_result_ids uuid[],
  last_observed_at timestamptz
)
language sql
stable
set search_path = ''
as $function$
  select
    r.evaluation_type,
    r.capability,
    r.metric_name,
    count(*) as sample_count,
    count(r.score) as scored_count,
    count(*) filter (where r.pass is true) as pass_count,
    count(*) filter (where r.pass is false) as fail_count,
    avg(r.score)::numeric as average_score,
    array_agg(r.id order by r.observed_at, r.id) as evidence_result_ids,
    max(r.observed_at) as last_observed_at
  from governance.ai_evaluation_results r
  where r.project_id = p_project_id
    and (p_ai_system_version_id is null or r.ai_system_version_id = p_ai_system_version_id)
    and (p_evaluation_type is null or r.evaluation_type = p_evaluation_type)
    and (p_capability is null or r.capability = p_capability)
  group by r.evaluation_type, r.capability, r.metric_name
  order by r.evaluation_type, r.capability nulls first, r.metric_name;
$function$;

revoke all on function governance.ai_evaluation_scorecard(uuid, uuid, text, text) from public;
grant execute on function governance.ai_evaluation_scorecard(uuid, uuid, text, text) to service_role;