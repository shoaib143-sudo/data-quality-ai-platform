-- Read-only daily governance outcome analytics over persisted evidence-backed reports.
-- Aggregates in PostgreSQL so long histories do not silently truncate to an arbitrary raw-row window.

create or replace function governance.query_governance_outcome_history(
  p_project_id uuid,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_limit integer default 2000
)
returns table(
  bucket_start timestamptz,
  report_count bigint,
  measured_overall_average numeric,
  unresolved_issues bigint,
  autonomous_actions bigint,
  human_interventions bigint,
  changes_revalidated bigint,
  critical_findings bigint,
  high_findings bigint
)
language sql
stable
security definer
set search_path = pg_catalog, governance
as $$
  with scoped as (
    select
      date_trunc('day', r.created_at) as bucket_start,
      case
        when coalesce(r.report_payload #>> '{scores,overall,status}', '') <> 'NOT_MEASURED'
          and coalesce(r.report_payload #>> '{scores,overall,value}', '') ~ '^-?[0-9]+([.][0-9]+)?$'
        then (r.report_payload #>> '{scores,overall,value}')::numeric
        else null
      end as overall_value,
      case
        when coalesce(r.report_payload #>> '{autonomousActivity,unresolvedIssues}', '') ~ '^[0-9]+([.][0-9]+)?$'
        then greatest(0, floor((r.report_payload #>> '{autonomousActivity,unresolvedIssues}')::numeric))::bigint
        else 0
      end as unresolved_issues,
      case
        when coalesce(r.report_payload #>> '{autonomousActivity,autonomousActions}', '') ~ '^[0-9]+([.][0-9]+)?$'
        then greatest(0, floor((r.report_payload #>> '{autonomousActivity,autonomousActions}')::numeric))::bigint
        else 0
      end as autonomous_actions,
      case
        when coalesce(r.report_payload #>> '{autonomousActivity,humanInterventions}', '') ~ '^[0-9]+([.][0-9]+)?$'
        then greatest(0, floor((r.report_payload #>> '{autonomousActivity,humanInterventions}')::numeric))::bigint
        else 0
      end as human_interventions,
      case
        when coalesce(r.report_payload #>> '{autonomousActivity,changesRevalidated}', '') ~ '^[0-9]+([.][0-9]+)?$'
        then greatest(0, floor((r.report_payload #>> '{autonomousActivity,changesRevalidated}')::numeric))::bigint
        else 0
      end as changes_revalidated,
      (
        select count(*)::bigint
        from jsonb_array_elements(
          case
            when jsonb_typeof(r.report_payload -> 'findings') = 'array' then r.report_payload -> 'findings'
            else '[]'::jsonb
          end
        ) finding
        where finding ->> 'status' in ('UNRESOLVED', 'BLOCKED')
          and finding ->> 'severity' = 'CRITICAL'
      ) as critical_findings,
      (
        select count(*)::bigint
        from jsonb_array_elements(
          case
            when jsonb_typeof(r.report_payload -> 'findings') = 'array' then r.report_payload -> 'findings'
            else '[]'::jsonb
          end
        ) finding
        where finding ->> 'status' in ('UNRESOLVED', 'BLOCKED')
          and finding ->> 'severity' = 'HIGH'
      ) as high_findings
    from governance.governance_outcome_reports r
    where r.project_id = p_project_id
      and (p_from is null or r.created_at >= p_from)
      and (p_to is null or r.created_at <= p_to)
  )
  select
    bucket_start,
    count(*)::bigint as report_count,
    round(avg(overall_value), 4) as measured_overall_average,
    sum(unresolved_issues)::bigint as unresolved_issues,
    sum(autonomous_actions)::bigint as autonomous_actions,
    sum(human_interventions)::bigint as human_interventions,
    sum(changes_revalidated)::bigint as changes_revalidated,
    sum(critical_findings)::bigint as critical_findings,
    sum(high_findings)::bigint as high_findings
  from scoped
  group by bucket_start
  order by bucket_start asc
  limit greatest(1, least(coalesce(p_limit, 2000), 5000));
$$;

revoke all on function governance.query_governance_outcome_history(
  uuid,timestamptz,timestamptz,integer
) from public, anon, authenticated;

grant execute on function governance.query_governance_outcome_history(
  uuid,timestamptz,timestamptz,integer
) to service_role;

comment on function governance.query_governance_outcome_history(
  uuid,timestamptz,timestamptz,integer
) is
  'Read-only project-scoped daily analytics over persisted governance outcome reports. Aggregates the full requested date range in PostgreSQL and returns bounded daily buckets.';
