-- Evidence-only profiling governance projection. No policy thresholds or AI inference
-- are embedded here; consumers receive canonical run, finding and score evidence.

create or replace view profiling.profile_run_governance_insights
with (security_invoker = true)
as
select
  pr.id as profile_run_id,
  pr.dataset_version_id,
  dv.dataset_id,
  d.project_id,
  pr.status::text as run_status,
  pr.started_at,
  pr.completed_at,
  pr.row_count,
  pr.column_count,
  pr.duplicate_row_count,
  qs.completeness_score,
  qs.uniqueness_score,
  qs.validity_score,
  qs.accuracy_score,
  qs.overall_score,
  coalesce(findings.total_findings, 0)::bigint as total_findings,
  coalesce(findings.high_findings, 0)::bigint as high_findings,
  coalesce(findings.medium_findings, 0)::bigint as medium_findings,
  coalesce(findings.info_findings, 0)::bigint as info_findings,
  (pr.summary ? 'investigation') as investigation_present
from profiling.profile_runs pr
join catalog.dataset_versions dv on dv.id = pr.dataset_version_id
join catalog.datasets d on d.id = dv.dataset_id
left join profiling.data_quality_scores qs on qs.profile_run_id = pr.id
left join lateral (
  select
    count(*) as total_findings,
    count(*) filter (where upper(pf.severity) = 'HIGH') as high_findings,
    count(*) filter (where upper(pf.severity) = 'MEDIUM') as medium_findings,
    count(*) filter (where upper(pf.severity) = 'INFO') as info_findings
  from profiling.profile_findings pf
  where pf.profile_run_id = pr.id
) findings on true;

grant select on profiling.profile_run_governance_insights to authenticated, service_role;
