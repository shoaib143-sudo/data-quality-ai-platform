begin;

create or replace view catalog.jdbc_discovery_evidence
with (security_invoker = true)
as
with asset_evidence as (
  select
    da.source_id,
    count(*) filter (where da.is_current) as current_assets,
    coalesce(sum(jsonb_array_length(coalesce(da.columns, '[]'::jsonb))) filter (where da.is_current), 0) as current_fields,
    count(distinct da.namespace) filter (where da.is_current and da.namespace is not null and btrim(da.namespace) <> '') as namespace_count,
    count(da.identity_key) filter (where da.is_current) as current_identity_count,
    count(distinct da.identity_key) filter (where da.is_current) as distinct_identity_count,
    count(*) filter (where da.is_current and (da.identity_key is null or btrim(da.identity_key) = '')) as null_identity_count
  from catalog.discovered_assets da
  group by da.source_id
),
run_evidence as (
  select
    dr.source_id,
    count(*) filter (where dr.status::text = 'COMPLETED') as completed_runs,
    max(dr.completed_at) filter (where dr.status::text = 'COMPLETED') as latest_completed_at
  from catalog.discovery_runs dr
  group by dr.source_id
),
revision_ranked as (
  select
    cr.source_id,
    cr.revision_number,
    cr.objects_observed,
    cr.objects_added,
    cr.objects_changed,
    cr.objects_missing,
    cr.objects_removed,
    cr.objects_unchanged,
    row_number() over (partition by cr.source_id order by cr.revision_number desc) as revision_rank
  from catalog.catalog_revisions cr
),
revision_evidence as (
  select
    rr.source_id,
    max(rr.revision_number) filter (where rr.revision_rank = 1) as latest_revision_number,
    max(rr.revision_number) filter (where rr.revision_rank = 2) as previous_revision_number,
    max(rr.objects_observed) filter (where rr.revision_rank = 1) as latest_objects_observed,
    max(rr.objects_added) filter (where rr.revision_rank = 1) as latest_objects_added,
    max(rr.objects_changed) filter (where rr.revision_rank = 1) as latest_objects_changed,
    max(rr.objects_missing) filter (where rr.revision_rank = 1) as latest_objects_missing,
    max(rr.objects_removed) filter (where rr.revision_rank = 1) as latest_objects_removed,
    max(rr.objects_unchanged) filter (where rr.revision_rank = 1) as latest_objects_unchanged
  from revision_ranked rr
  where rr.revision_rank <= 2
  group by rr.source_id
),
projection_evidence as (
  select ccsa.source_id, count(*) as projected_assets
  from catalog.current_catalog_source_assets ccsa
  group by ccsa.source_id
),
version_evidence as (
  select dav.source_id, count(*) as physical_versions
  from catalog.discovered_asset_versions dav
  group by dav.source_id
)
select
  ds.id as source_id,
  ds.project_id,
  ds.name as source_name,
  ds.source_type,
  ds.status as lifecycle_status,
  sor.operational_state,
  coalesce(ae.current_assets, 0) as current_assets,
  coalesce(ae.current_fields, 0) as current_fields,
  coalesce(ae.namespace_count, 0) as namespace_count,
  coalesce(re.completed_runs, 0) as completed_runs,
  re.latest_completed_at,
  rev.latest_revision_number,
  rev.previous_revision_number,
  rev.latest_objects_observed,
  rev.latest_objects_added,
  rev.latest_objects_changed,
  rev.latest_objects_missing,
  rev.latest_objects_removed,
  rev.latest_objects_unchanged,
  coalesce(pe.projected_assets, 0) as projected_assets,
  coalesce(ve.physical_versions, 0) as physical_versions,
  coalesce(ae.current_identity_count, 0) = coalesce(ae.current_assets, 0)
    and coalesce(ae.distinct_identity_count, 0) = coalesce(ae.current_assets, 0)
    and coalesce(ae.null_identity_count, 0) = 0 as identity_unique_and_complete,
  coalesce(pe.projected_assets, 0) = coalesce(ae.current_assets, 0) as catalog_projection_complete,
  coalesce(ae.namespace_count, 0) > 1 as multi_namespace_observed,
  rev.previous_revision_number is not null as repeat_scan_evidence_present,
  rev.previous_revision_number is not null
    and coalesce(rev.latest_objects_added, 0) = 0
    and coalesce(rev.latest_objects_changed, 0) = 0
    and coalesce(rev.latest_objects_missing, 0) = 0
    and coalesce(rev.latest_objects_removed, 0) = 0
    and coalesce(rev.latest_objects_unchanged, 0) = coalesce(rev.latest_objects_observed, 0) as repeat_scan_stable,
  case
    when coalesce(re.completed_runs, 0) = 0 and coalesce(ae.current_assets, 0) = 0 then 'UNOBSERVED'
    when coalesce(re.completed_runs, 0) = 0
      or coalesce(ae.current_assets, 0) = 0
      or not (
        coalesce(ae.current_identity_count, 0) = coalesce(ae.current_assets, 0)
        and coalesce(ae.distinct_identity_count, 0) = coalesce(ae.current_assets, 0)
        and coalesce(ae.null_identity_count, 0) = 0
        and coalesce(pe.projected_assets, 0) = coalesce(ae.current_assets, 0)
      ) then 'EVIDENCE_INCONSISTENT'
    when rev.previous_revision_number is null then 'SINGLE_SCAN_EVIDENCE'
    when coalesce(rev.latest_objects_added, 0) = 0
      and coalesce(rev.latest_objects_changed, 0) = 0
      and coalesce(rev.latest_objects_missing, 0) = 0
      and coalesce(rev.latest_objects_removed, 0) = 0
      and coalesce(rev.latest_objects_unchanged, 0) = coalesce(rev.latest_objects_observed, 0) then 'REPEAT_SCAN_STABLE'
    else 'REPEAT_SCAN_CHANGED'
  end as evidence_state,
  'OBSERVED_JDBC_DISCOVERY_EVIDENCE_DOES_NOT_MUTATE_SOURCE_CONFIGURATION'::text as authority_semantic
from catalog.data_sources ds
left join catalog.source_operational_readiness sor on sor.source_id = ds.id
left join asset_evidence ae on ae.source_id = ds.id
left join run_evidence re on re.source_id = ds.id
left join revision_evidence rev on rev.source_id = ds.id
left join projection_evidence pe on pe.source_id = ds.id
left join version_evidence ve on ve.source_id = ds.id
where ds.source_type::text = 'JDBC';

comment on view catalog.jdbc_discovery_evidence is
  'Read-only observed JDBC discovery evidence. This projection does not mutate source configuration and is not a substitute for catalog.verify_jdbc_source_acceptance, which remains the production acceptance authority.';

revoke all on catalog.jdbc_discovery_evidence from public, anon;
grant select on catalog.jdbc_discovery_evidence to authenticated, service_role;
revoke insert, update, delete, truncate, references, trigger on catalog.jdbc_discovery_evidence from authenticated, service_role;

create or replace function catalog.verify_jdbc_discovery_evidence(p_project_id uuid default null)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with evidence as (
    select *
    from catalog.jdbc_discovery_evidence
    where p_project_id is null or project_id = p_project_id
  ),
  counts as (
    select
      count(*) as jdbc_sources,
      count(*) filter (where evidence_state <> 'UNOBSERVED') as observed_sources,
      count(*) filter (where multi_namespace_observed) as multi_namespace_sources,
      count(*) filter (where repeat_scan_evidence_present) as repeat_scan_sources,
      count(*) filter (where repeat_scan_stable) as repeat_scan_stable_sources,
      count(*) filter (where evidence_state = 'EVIDENCE_INCONSISTENT') as inconsistent_sources,
      count(*) filter (where evidence_state <> 'UNOBSERVED' and not identity_unique_and_complete) as identity_violations,
      count(*) filter (where evidence_state <> 'UNOBSERVED' and not catalog_projection_complete) as projection_violations,
      count(*) filter (where repeat_scan_stable and not repeat_scan_evidence_present) as repeatability_violations,
      count(*) filter (where multi_namespace_observed and current_assets = 0) as namespace_violations,
      count(*) filter (where evidence_state not in ('UNOBSERVED','EVIDENCE_INCONSISTENT','SINGLE_SCAN_EVIDENCE','REPEAT_SCAN_STABLE','REPEAT_SCAN_CHANGED')) as unknown_state_count
    from evidence
  )
  select jsonb_build_object(
    'state', 'JDBC_DISCOVERY_EVIDENCE_GOVERNED',
    'valid', inconsistent_sources = 0
      and identity_violations = 0
      and projection_violations = 0
      and repeatability_violations = 0
      and namespace_violations = 0
      and unknown_state_count = 0,
    'project_id', p_project_id,
    'jdbc_sources', jdbc_sources,
    'observed_sources', observed_sources,
    'multi_namespace_sources', multi_namespace_sources,
    'repeat_scan_sources', repeat_scan_sources,
    'repeat_scan_stable_sources', repeat_scan_stable_sources,
    'violations', jsonb_build_object(
      'inconsistent_sources', inconsistent_sources,
      'identity_violations', identity_violations,
      'projection_violations', projection_violations,
      'repeatability_violations', repeatability_violations,
      'namespace_violations', namespace_violations,
      'unknown_state_count', unknown_state_count
    ),
    'authority_semantic', 'OBSERVED_JDBC_DISCOVERY_EVIDENCE_DOES_NOT_MUTATE_SOURCE_CONFIGURATION',
    'acceptance_authority', 'catalog.verify_jdbc_source_acceptance'
  )
  from counts;
$$;

comment on function catalog.verify_jdbc_discovery_evidence(uuid) is
  'Validates consistency of the read-only JDBC discovery evidence projection. It does not replace or weaken the production JDBC acceptance verifier.';

revoke all on function catalog.verify_jdbc_discovery_evidence(uuid) from public, anon;
grant execute on function catalog.verify_jdbc_discovery_evidence(uuid) to authenticated, service_role;

commit;
